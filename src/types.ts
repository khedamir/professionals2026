export type UserId = string;
export type BoardId = string;
export type BoardHash = string;

export interface User {
  id: UserId;
  email: string;
  name: string;
  passwordHash: string;
}

export interface BoardAccess {
  userId: UserId;
  canEdit: boolean;
}

export interface BoardLike {
  userId: UserId;
  createdAt: Date;
}

export type BoardObjectType = 'text' | 'image' | 'rect' | 'circle' | 'line';

export interface BoardObjectBase {
  id: string;
  type: BoardObjectType;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
}

export interface TextObject extends BoardObjectBase {
  type: 'text';
  text: string;
}

export interface ImageObject extends BoardObjectBase {
  type: 'image';
  url: string;
}

export interface ShapeObject extends BoardObjectBase {
  type: 'rect' | 'circle' | 'line';
  color: string;
}

export type BoardObject = TextObject | ImageObject | ShapeObject;

export interface ObjectLock {
  objectId: string;
  userId: UserId;
  userName: string;
  lockedAt: Date;
}

export interface Board {
  id: BoardId;
  title: string;
  ownerId: UserId;
  isPublic: boolean;
  publicHash?: BoardHash;
  createdAt: Date;
  updatedAt: Date;
  canvasWidth: number;
  canvasHeight: number;
  objects: BoardObject[];
  accessList: BoardAccess[];
  likes: BoardLike[];
  locks: ObjectLock[];
}

export interface JwtPayload {
  userId: UserId;
  email: string;
  name: string;
}

export interface WsClientContext {
  userId?: UserId;
  userName?: string;
  boardId?: BoardId;
  boardHash?: BoardHash;
  canEdit: boolean;
}

export type BoardEventType =
  | 'focus_object'
  | 'blur_object'
  | 'update_object'
  | 'add_object'
  | 'delete_object'
  | 'full_state';

export interface BoardEventBase {
  type: BoardEventType;
}

export interface FocusObjectEvent extends BoardEventBase {
  type: 'focus_object';
  objectId: string;
}

export interface BlurObjectEvent extends BoardEventBase {
  type: 'blur_object';
  objectId: string;
}

export interface UpdateObjectEvent extends BoardEventBase {
  type: 'update_object';
  object: BoardObject;
}

export interface AddObjectEvent extends BoardEventBase {
  type: 'add_object';
  object: BoardObject;
}

export interface DeleteObjectEvent extends BoardEventBase {
  type: 'delete_object';
  objectId: string;
}

export interface FullStateEvent extends BoardEventBase {
  type: 'full_state';
  boardId: BoardId;
  canvasWidth: number;
  canvasHeight: number;
  objects: BoardObject[];
  locks: ObjectLock[];
}

export type BoardIncomingEvent =
  | FocusObjectEvent
  | BlurObjectEvent
  | UpdateObjectEvent
  | AddObjectEvent
  | DeleteObjectEvent;

export type BoardOutgoingEvent =
  | BoardIncomingEvent
  | FullStateEvent;

