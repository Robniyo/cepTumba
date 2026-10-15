import { AppRole } from '../auth/auth-role.type';

// Roles considered leaders for group / DM authorization
export const LEADER_ROLES: AppRole[] = [
  'president',
  'vp_prayers',
  'vp_social',
  'advisor_prayers',
  'advisor_social',
  'accountant',
  'secretary',
];

export const isLeader = (role: AppRole): boolean => LEADER_ROLES.includes(role);

export type ConversationType = 'direct' | 'group';
export type SystemGroupType = 'leaders' | 'alumni';
export type MessageKind = 'text' | 'system';

export type ConversationSummary = {
  id: string;
  type: ConversationType;
  name: string | null;
  isSystem: boolean;
  systemGroupType: SystemGroupType | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  // For direct chats: the other participant info; for groups: null
  peer: { id: string; name: string; email: string; role: AppRole } | null;
  participantsCount: number;
  lastMessage: {
    id: string;
    body: string;
    senderId: string | null;
    senderName: string | null;
    createdAt: string;
    type: MessageKind;
  } | null;
  unreadCount: number;
  lastReadAt: string | null;
};

export type MessageAttachment = {
  url: string;
  type: string;
  name: string;
  size: number;
};

export type AttachmentInput = MessageAttachment;

export type MessageResponse = {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string | null;
  senderRole: AppRole | null;
  type: MessageKind;
  body: string;
  attachment: MessageAttachment | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
