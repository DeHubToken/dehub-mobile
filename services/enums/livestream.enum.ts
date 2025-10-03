export enum LivestreamEvents {
  StreamData = "streamData",
  StartStream = "stream.start",
  JoinRoom = "stream.join.room",
  EndStream = "stream.end",
  JoinStream = "stream.join",
  LeaveStream = "stream.left",
  TipStreamer = "streamer.tip",
  SendMessage = "stream.message",
  LikeStream = "stream.like",
  ViewCountUpdate = "stream.viewers.update",
  StreamPaused = "stream.paused",
  StreamResumed = "stream.resumed",
  UserBanned = "stream.user.banned",
  UserMuted = "stream.user.muted",
  StreamError = "stream.error"
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
