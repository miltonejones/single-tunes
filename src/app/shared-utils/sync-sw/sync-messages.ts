// Sync message types and interfaces
export type SyncMessageType =
  | 'INIT'
  | 'STATE_UPDATE'
  | 'USER_ACTION'
  | 'TOAST'
  | 'HEARTBEAT'
  | 'PUBLISH'
  | 'POLL';

export interface SyncMessage {
  type: SyncMessageType;
  payload?: any;
  id?: string;
}

export interface InitMessage extends SyncMessage {
  type: 'INIT';
  userKey: string;
  instanceId: string;
}

export interface StateUpdateMessage extends SyncMessage {
  type: 'STATE_UPDATE';
  state: any;
}

export interface ToastMessage extends SyncMessage {
  type: 'TOAST';
  text: string;
}

export interface UserActionMessage extends SyncMessage {
  type: 'USER_ACTION';
  action: string;
  data?: any;
}