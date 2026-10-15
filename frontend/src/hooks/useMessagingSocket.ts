import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { MESSAGING_API_BASE, type ChatMessage } from "@/data/messagingStore";

export type MessagingSocketEvents = {
  onMessage?: (message: ChatMessage) => void;
  onMessageUpdate?: (message: ChatMessage) => void;
  onMessageDelete?: (message: ChatMessage) => void;
  onRead?: (payload: { conversationId: string; userId: string; lastReadAt: string }) => void;
  onTyping?: (payload: { conversationId: string; userId: string; isTyping: boolean }) => void;
};

export const useMessagingSocket = (
  token: string | null,
  handlers: MessagingSocketEvents,
) => {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!token) return;
    const socket = io(`${MESSAGING_API_BASE}/messaging`, {
      auth: { token },
      transports: ["websocket"],
      autoConnect: true,
    });
    socketRef.current = socket;

    socket.on("message:new", (msg: ChatMessage) => handlersRef.current.onMessage?.(msg));
    socket.on("message:updated", (msg: ChatMessage) => handlersRef.current.onMessageUpdate?.(msg));
    socket.on("message:deleted", (msg: ChatMessage) => handlersRef.current.onMessageDelete?.(msg));
    socket.on("message:read", (p) => handlersRef.current.onRead?.(p));
    socket.on("typing", (p) => handlersRef.current.onTyping?.(p));

    return () => {
      socket.off("message:new");
      socket.off("message:updated");
      socket.off("message:deleted");
      socket.off("message:read");
      socket.off("typing");
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const emitTyping = (conversationId: string, participantIds: string[], isTyping: boolean) => {
    socketRef.current?.emit("typing", { conversationId, participantIds, isTyping });
  };

  return { emitTyping };
};
