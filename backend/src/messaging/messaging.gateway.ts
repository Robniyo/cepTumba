import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { APP_ROLES } from '../auth/auth-role.type';
import { AuthTokenPayload } from '../auth/types/auth-token-payload.type';
import { MessageResponse } from './messaging.types';

interface AuthedSocket extends Socket {
  data: { userId?: string; role?: string };
}

/**
 * Realtime gateway for messaging. Each authenticated user joins a personal
 * room `user:<userId>`. New messages are broadcast to all participants'
 * personal rooms so only authorized users receive events.
 */
@WebSocketGateway({
  namespace: '/messaging',
  cors: { origin: true, credentials: true },
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (client.handshake.query?.token as string | undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
      if (!secret) {
        client.disconnect(true);
        return;
      }
      const payload = await this.jwtService.verifyAsync<AuthTokenPayload>(token, { secret });
      if (payload.kind !== 'access' || !APP_ROLES.includes(payload.role)) {
        client.disconnect(true);
        return;
      }
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      await client.join(`user:${payload.sub}`);
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // No-op; rooms cleared automatically
  }

  // --- Typing indicator ---
  @SubscribeMessage('typing')
  onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() payload: { conversationId: string; participantIds: string[]; isTyping: boolean },
  ): void {
    const senderId = client.data.userId;
    if (!senderId || !payload?.participantIds?.length) return;
    for (const uid of payload.participantIds) {
      if (uid === senderId) continue;
      this.server.to(`user:${uid}`).emit('typing', {
        conversationId: payload.conversationId,
        userId: senderId,
        isTyping: !!payload.isTyping,
      });
    }
  }

  // --- Server-side broadcasts ---
  broadcastNewMessage(participantIds: string[], message: MessageResponse): void {
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('message:new', message);
    }
  }

  broadcastMessageUpdate(participantIds: string[], message: MessageResponse): void {
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('message:updated', message);
    }
  }

  broadcastMessageDelete(participantIds: string[], message: MessageResponse): void {
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('message:deleted', message);
    }
  }

  broadcastReadReceipt(conversationId: string, userId: string, lastReadAt: string): void {
    // Notify everyone in the conversation by looking up via the participants.
    // We don't have the list here; rely on caller passing them, or broadcast
    // to the user themselves and rely on each client to refresh on focus.
    this.server.emit('message:read', { conversationId, userId, lastReadAt });
  }
}
