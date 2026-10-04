/** Provider duration, framing and resolution limits shared with web Creator. */
export interface CreatorVideoRules {
  minDuration?: number;
  maxDuration?: number;
  defaultDuration?: number;
  allowedDurations?: number[];
  resolutions?: string[];
  aspectRatios?: string[];
  supportsResolution: boolean;
}
export const CREATOR_VIDEO_RULES: Record<string, CreatorVideoRules> ={
  "seedance-2.5":  {
  "minDuration":  4,
  "maxDuration":  30,
  "defaultDuration":  5,
  "resolutions":  [
  "480p",
  "720p"
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1",
  "4:3",
  "3:4",
  "21:9"
  ],
  "supportsResolution":  true
  },
  "kling-2.6-pro":  {
  "minDuration":  5,
  "maxDuration":  10,
  "defaultDuration":  5,
  "allowedDurations":  [
  5,
  10
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false
  },
  "luma-ray2":  {
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1",
  "3:4",
  "4:3"
  ],
  "supportsResolution":  false,
  "allowedDurations":  [
  5
  ]
  },
  "runway-gen4":  {
  "minDuration":  5,
  "maxDuration":  10,
  "defaultDuration":  10,
  "allowedDurations":  [
  5,
  10
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false
  },
  "minimax-video":  {
  "supportsResolution":  false,
  "allowedDurations":  [
  6
  ]
  },
  "ltx-video":  {
  "supportsResolution":  false,
  "allowedDurations":  [
  5
  ]
  },
  "seedance-1.5-pro":  {
  "minDuration":  2,
  "maxDuration":  12,
  "defaultDuration":  5,
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  true
  },
  "seedance-2.0":  {
  "minDuration":  4,
  "maxDuration":  15,
  "defaultDuration":  5,
  "resolutions":  [
  "480p",
  "720p"
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  true
  },
  "seedance-2.0-fast":  {
  "minDuration":  4,
  "maxDuration":  15,
  "defaultDuration":  5,
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  true
  },
  "veo-3.1":  {
  "minDuration":  4,
  "maxDuration":  8,
  "defaultDuration":  4,
  "allowedDurations":  [
  4,
  6,
  8
  ],
  "resolutions":  [
  "720p",
  "1080p"
  ],
  "aspectRatios":  [
  "16:9",
  "9:16"
  ],
  "supportsResolution":  true
  },
  "veo-3.1-fast":  {
  "minDuration":  4,
  "maxDuration":  8,
  "defaultDuration":  4,
  "allowedDurations":  [
  4,
  6,
  8
  ],
  "resolutions":  [
  "720p",
  "1080p"
  ],
  "aspectRatios":  [
  "16:9",
  "9:16"
  ],
  "supportsResolution":  true
  },
  "kling-3.0":  {
  "minDuration":  3,
  "maxDuration":  15,
  "defaultDuration":  5,
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false
  },
  "kling-3.0-standard":  {
  "minDuration":  3,
  "maxDuration":  15,
  "defaultDuration":  5,
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false
  },
  "kling-2.5-turbo":  {
  "minDuration":  5,
  "maxDuration":  10,
  "defaultDuration":  5,
  "allowedDurations":  [
  5,
  10
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false
  },
  "hailuo-2.3":  {
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false,
  "allowedDurations":  [
  6
  ]
  },
  "hailuo-2.3-fast":  {
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false,
  "allowedDurations":  [
  6
  ]
  },
  "wan-2.6":  {
  "minDuration":  5,
  "maxDuration":  15,
  "defaultDuration":  5,
  "allowedDurations":  [
  5,
  10,
  15
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  true
  },
  "wan-2.5":  {
  "minDuration":  5,
  "maxDuration":  10,
  "defaultDuration":  5,
  "allowedDurations":  [
  5,
  10
  ],
  "resolutions":  [
  "720p",
  "1080p"
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  true
  },
  "luma-ray2-flash":  {
  "minDuration":  5,
  "maxDuration":  9,
  "defaultDuration":  5,
  "allowedDurations":  [
  5,
  9
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "21:9",
  "9:21"
  ],
  "supportsResolution":  false
  },
  "pixverse-v5":  {
  "minDuration":  5,
  "maxDuration":  8,
  "defaultDuration":  5,
  "allowedDurations":  [
  5,
  8
  ],
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  true
  },
  "ltx-13b":  {
  "minDuration":  5,
  "maxDuration":  10,
  "defaultDuration":  5,
  "aspectRatios":  [
  "16:9",
  "9:16",
  "1:1"
  ],
  "supportsResolution":  false
  }
};
