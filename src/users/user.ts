import bodyParser from "body-parser";
import express from "express";
import { BASE_USER_PORT, REGISTRY_PORT, BASE_ONION_ROUTER_PORT } from "../config";
import {
  createRandomSymmetricKey,
  exportSymKey,
  rsaEncrypt,
  symEncrypt,
} from "../crypto";
import fetch from "node-fetch";

export async function user(userId: number) {
  const app = express();
  app.use(express.json());
  app.use(bodyParser.json());

  let lastSentMessage: string | null = null;
  let lastReceivedMessage: string | null = null;

  app.get("/status", (req, res) => {
    res.send("live");
  });

  app.get("/getLastReceivedMessage", (req, res) => {
    res.json({ result: lastReceivedMessage });
  });

  app.get("/getLastSentMessage", (req, res) => {
    res.json({ result: lastSentMessage });
  });

  app.post("/message", (req, res) => {
    const { message } = req.body;
    lastReceivedMessage = message;
    res.send("success");
  });

  app.post("/sendMessage", async (req, res) => {
    const { message, destinationUserId } = req.body;

    try {
      const registryRes = await fetch(`http://localhost:${REGISTRY_PORT}/getNodeRegistry`);
      const registryData = await registryRes.json() as { nodes: { nodeId: number; pubKey: string }[] };
      const nodes = registryData.nodes;

      if (nodes.length < 3) {
        return res.status(500).json({ error: "Pas assez de noeuds pour créer un circuit" });
      }

      const circuit = nodes.sort(() => 0.5 - Math.random()).slice(0, 3);

      let payload = message;
      let destination = BASE_USER_PORT + destinationUserId;

      for (let i = 2; i >= 0; i--) {
        const node = circuit[i];
        const symKey = await createRandomSymmetricKey();
        const exportedSymKey = await exportSymKey(symKey); // base64 string

        const destString = destination.toString().padStart(10, "0");
        const data = destString + payload;

        const encryptedData = await symEncrypt(symKey, data);
        const encryptedKey = await rsaEncrypt(exportedSymKey, node.pubKey);

        payload = encryptedKey + encryptedData;
        destination = BASE_ONION_ROUTER_PORT + node.nodeId;
      }

      const entryNodePort = BASE_ONION_ROUTER_PORT + circuit[0].nodeId;
      await fetch(`http://localhost:${entryNodePort}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: payload }),
      });

      lastSentMessage = message;
      return res.status(200).json({ message: "Message envoyé avec succès" });
    } catch (err: any) {
      console.error(err.message);
      return res.status(500).json({ error: "Erreur lors de l'envoi du message" });
    }
  });

  const port = BASE_USER_PORT + userId;
  const server = app.listen(port, () => {
    console.log(`User ${userId} est en ligne sur le port ${port}`);
  });

  return server;
}

if (require.main === module) {
  const userId = parseInt(process.argv[2]);
  if (!isNaN(userId)) {
    user(userId);
  }
}
