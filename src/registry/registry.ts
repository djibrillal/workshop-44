import bodyParser from "body-parser";
import express, { Request, Response } from "express";
import { REGISTRY_PORT } from "../config";

export type Node = { nodeId: number; pubKey: string };

export type RegisterNodeBody = {
  nodeId: number;
  pubKey: string;
};

export type GetNodeRegistryBody = {
  nodes: Node[];
};

export async function launchRegistry() {
  const _registry = express();
  _registry.use(express.json());
  _registry.use(bodyParser.json());

  // ✅ Route GET /status
  _registry.get("/status", (req: Request, res: Response) => {
    res.send("live");
  });

  // ✅ Stockage local des nodes
  const nodeRegistry: Node[] = [];

  // ✅ Route POST /registerNode
  _registry.post("/registerNode", (req: Request, res: Response) => {
    const { nodeId, pubKey } = req.body;

    if (typeof nodeId !== "number" || typeof pubKey !== "string") {
      return res.status(400).json({ error: "Invalid payload" });
    }

    nodeRegistry.push({ nodeId, pubKey });

    return res.status(200).json({ message: "Node registered" }); // ✅ le return manquant est ici
  });

  // ✅ Route GET /getNodeRegistry
  _registry.get("/getNodeRegistry", (req: Request, res: Response) => {
    res.status(200).json({ nodes: nodeRegistry });
  });

  // ✅ Lancement du serveur
  const server = _registry.listen(REGISTRY_PORT, () => {
    console.log(`registry is listening on port ${REGISTRY_PORT}`);
  });

  return server;
}
