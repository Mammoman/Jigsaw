import type { Party, PartyServer, PartyConnection } from "partykit/server";

export default class JigsawServer implements PartyServer {
  constructor(public party: Party) {}

  onConnect(conn: PartyConnection, ctx: any) {
    // Initialize or send current board state if we were tracking it server-side.
    // For ephemeral state, we'll just let peers broadcast.
  }

  onMessage(message: string, sender: PartyConnection) {
    // Broadcast the message to all other connected clients
    this.party.broadcast(message, [sender.id]);
  }

  onClose(conn: PartyConnection) {
    // Notify others that this peer left so their cursor can be removed
    this.party.broadcast(JSON.stringify({ type: "PEER_LEFT", payload: { id: conn.id } }));
  }
}
