// Sync message types and interfaces
export type SyncMessageType =
  | 'INIT'
  | 'STATE_UPDATE'
  | 'USER_ACTION'
  | 'TOAST'
  | 'HEARTBEAT_RESULT'
  | 'REGISTER';

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

/** Sent from the service worker to the client with the result of a heartbeat POST. */
export interface HeartbeatResultMessage extends SyncMessage {
  type: 'HEARTBEAT_RESULT';
  leaderInstanceId?: string;
  stale?: boolean;
  state?: any;
}

/** Sent from the client to the service worker after a successful /sync/register. */
export interface RegisterMessage extends SyncMessage {
  type: 'REGISTER';
  queueUrl: string;
}
