import bodyParser from "body-parser";
import express from "express";
import { webcrypto } from "crypto";
import { BASE_ONION_ROUTER_PORT, REGISTRY_PORT } from "../config";
import {
  generateRsaKeyPair,
  exportPrvKey,
  exportPubKey,
  rsaDecrypt,
  symDecrypt,
} from "../crypto";
import fetch from "node-fetch";

export async function simpleOnionRouter(nodeId: number) {
  const onionRouter = express();
  onionRouter.use(express.json());
  onionRouter.use(bodyParser.json());

  const port = BASE_ONION_ROUTER_PORT + nodeId;

  let lastEncryptedMessage: string | null = null;
  let lastDecryptedMessage: string | null = null;
  let lastDestination: number | null = null;

  let privateKey: webcrypto.CryptoKey | null = null;

  onionRouter.get("/status", (req, res) => {
    res.send("live");
  });

  onionRouter.get("/getLastReceivedEncryptedMessage", (req, res) => {
    res.json({ result: lastEncryptedMessage });
  });

  onionRouter.get("/getLastReceivedDecryptedMessage", (req, res) => {
    res.json({ result: lastDecryptedMessage });
  });

  onionRouter.get("/getLastMessageDestination", (req, res) => {
    res.json({ result: lastDestination });
  });

  onionRouter.get("/getPrivateKey", async (req, res) => {
    const exported = await exportPrvKey(privateKey);
    res.json({ result: exported });
  });

  onionRouter.post("/message", async (req, res) => {
    try {
      const { message } = req.body;
      lastEncryptedMessage = message;

      const encryptedKey = message.slice(0, 344);
      const encryptedPayload = message.slice(344);

      // 🔥 Correction ici : on reçoit une clé exportée en base64
      const exportedSymKey = await rsaDecrypt(encryptedKey, privateKey!);

      // 🔥 symDecrypt attend une string base64 comme clé => on ne doit PAS l'importer avant !
      const decryptedPayload = await symDecrypt(exportedSymKey, encryptedPayload);

      lastDecryptedMessage = decryptedPayload;

      const nextDestination = parseInt(decryptedPayload.slice(0, 10));
      const actualMessage = decryptedPayload.slice(10);
      lastDestination = nextDestination;

      await fetch(`http://localhost:${nextDestination}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: actualMessage }),
      });

      res.sendStatus(200);
    } catch (err: any) {
      console.error("❌ Erreur dans /message du node:", err.message);
      res.sendStatus(500);
    }
  });

  const server = onionRouter.listen(port, async () => {
    console.log(`🧅 Onion router ${nodeId} is listening on port ${port}`);

    const { publicKey, privateKey: privKey } = await generateRsaKeyPair();
    privateKey = privKey;

    const pubKeyStr = await exportPubKey(publicKey);

    await fetch(`http://localhost:${REGISTRY_PORT}/registerNode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId, pubKey: pubKeyStr }),
    });
  });

  return server;
}

if (require.main === module) {
  const nodeId = parseInt(process.argv[2]);

  if (isNaN(nodeId)) {
    console.error("❌ Veuillez fournir un nodeId valide");
    process.exit(1);
  }

  simpleOnionRouter(nodeId);
}
