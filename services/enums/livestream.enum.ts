export enum LivestreamEvents {
  StreamData = "streamData",
  StartStream = "stream.start",
  JoinRoom = "stream.join.room",
  EndStream = "stream.end",
  JoinStream = "stream.join",
  AnonJoinStream = "stream.join.anon",
  LeaveStream = "stream.left",
  TipStreamer = "streamer.tip",
  /** The chain paid for a gift. Carries the paid amount, never the claim. */
  TipConfirmed = "streamer.tip.confirmed",
  Follow = "stream.follow",
  Subscribe = "stream.subscribe",
  Share = "stream.share",
  /** The live creator saved their overlay; redraw it. */
  OverlayUpdated = "stream.overlay.updated",
  SendMessage = "stream.message",
  LikeStream = "stream.like",
  ViewCountUpdate = "stream.viewers.update",
  StreamPaused = "stream.paused",
  StreamResumed = "stream.resumed",
  UserBanned = "stream.user.banned",
  UserMuted = "stream.user.muted",
  StreamError = "stream.error",
  StreamReaction = "stream.reaction",
  SettingsUpdate = "stream.settings.update",
  /** A hype train starting, moving or ending in the stream's room. */
  HypeUpdate = "stream.hype"
}

export enum StreamActivityType {
  START = "START",
  END = "END",
  COMMENT = "COMMENT",
  MESSAGE = "MESSAGE",
  LIKE = "LIKE",
  REACTION = "REACTION",
  JOINED = "JOINED",
  LEFT = "LEFT",
  TIP = "TIP"
}

export enum StreamStatus {
  OFFLINE = 'OFFLINE',
  LIVE = 'LIVE',
  PAUSED = 'PAUSED',
  ENDED = 'ENDED',
  SCHEDULED = 'SCHEDULED',
}

