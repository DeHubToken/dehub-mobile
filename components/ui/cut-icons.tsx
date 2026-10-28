import React from "react";
import Svg, { Path, G, Defs, Mask, Rect, ClipPath, type SvgProps } from "react-native-svg";
type CutProps = Omit<SvgProps, "color"> & { size?: number; color?: string };

// Shared 32-unit Cut artwork. Preserve explicit path fills and per-instance mask IDs.
const CutHome = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4.9 13.4L16 4.9L27.1 13.4V24Q27.1 27.1 24 27.1H20V18.8H12V27.1H8Q4.9 27.1 4.9 24Z" fill={fill ?? "none"} fillRule="evenodd" stroke={color} strokeWidth={Number(strokeWidth) * 1.3} strokeLinejoin="round"/></Svg>
);
const CutSearch = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M22.1 13.2A8.8 8.8 0 1 1 4.5 13.2A8.8 8.8 0 1 1 22.1 13.2Z" fill="none" fillRule="evenodd" stroke={color} strokeWidth={Number(strokeWidth) * 1.45} strokeLinejoin="round"/><G transform="rotate(45 16 16)"><Path d="M21.5 14.55H31.1V15.45Q31.1 17.45 29.1 17.45H21.5Z" fill={color} fillRule="evenodd"/></G></Svg>
);
const CutMessageEnvelope = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 5H20.2Q28 5 28 12.8V27H11.8Q4 27 4 19.2Z M6.6 7.6V19.2Q6.6 24.4 11.8 24.4H25.4V12.8Q25.4 7.6 20.2 7.6Z" fill={color} fillRule="evenodd"/><Path d="M6 8L16 16.6L26 8" fill="none" fillRule="evenodd" stroke={color} strokeWidth={Number(strokeWidth) * 1.3} strokeLinejoin="round"/></Svg>
);
const CutMessages = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 6H21Q27 6 27 12V26L20 21H11Q5 21 5 15Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M11.4570 11.5250H21.3000V10.8320Q21.3000 9.8750 20.3430 9.8750H10.5000V10.5680Q10.5000 11.5250 11.4570 11.5250Z" fill={color} fillRule="evenodd"/><Path d="M11.4570 14.6250H18.2000V13.9320Q18.2000 12.9750 17.2430 12.9750H10.5000V13.6680Q10.5000 14.6250 11.4570 14.6250Z" fill={color} fillRule="evenodd"/><Path d="M11.4570 17.7250H21.3000V17.0320Q21.3000 16.0750 20.3430 16.0750H10.5000V16.7680Q10.5000 17.7250 11.4570 17.7250Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutAlerts = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M12.9 7.7V2.6Q12.9 .5 15 .5H19.1V7.7Z" fill={color} fillRule="evenodd" /><Path d="M2.5 26.3L7.2 12.3Q8.2 5.1 15 5.1H17Q23.8 5.1 24.8 12.3L29.5 26.3H20.2V25.2Q20.2 23.8 23.8 23.8H25.2L22.3 12.6Q21.6 7.7 17 7.7H15Q10.4 7.7 9.7 12.6L6.8 23.8H8.2Q11.8 23.8 11.8 25.2V26.3Z" fill={color} fillRule="evenodd" /><Path d="M14.1 29.3V24.2Q14.1 22.8 15.5 22.8H17.9V27.9Q17.9 29.3 16.5 29.3Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutProfile = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M11 5H15.5Q21 5 21 10Q21 15 15.5 15H11Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M5 28V19H18.5Q27 19 27 27V28H26Q24.6 28 24.6 26.6Q24.4 21.4 18.5 21.4H7.4V26.6Q7.4 28 6 28Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutSave = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M8 5H17.5Q24 5 24 11.5V28L16 23L8 28Z" fill={fill ?? "none"} stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutLike = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M10 27V15L15 5H16Q19 5 19 8V13H26V20Q26 27 19 27Z" fill={fill ?? "none"} stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M3.8 15H5Q6.2 15 6.2 16.4V27H5Q3.8 27 3.8 25.6Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutRepost = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M6.2000 14.6080L6.2000 8.2000L26.0000 8.2000L26.0000 7.1920Q26.0000 5.8000 24.6080 5.8000L3.8000 5.8000L3.8000 16.0000L4.8080 16.0000Q6.2000 16.0000 6.2000 14.6080Z" fill={color} fillRule="evenodd" /><Path d="M21.1358 3.8328L24.3029 7.0000L20.1515 11.1515L20.8642 11.8642Q21.8485 12.8485 22.8328 11.8642L27.6971 7.0000L21.8485 1.1515L21.1358 1.8642Q20.1515 2.8485 21.1358 3.8328Z" fill={color} fillRule="evenodd" /><Path d="M25.8000 17.3920L25.8000 23.8000L6.0000 23.8000L6.0000 24.8080Q6.0000 26.2000 7.3920 26.2000L28.2000 26.2000L28.2000 16.0000L27.1920 16.0000Q25.8000 16.0000 25.8000 17.3920Z" fill={color} fillRule="evenodd" /><Path d="M9.1672 20.1358L4.3029 25.0000L10.1515 30.8485L10.8642 30.1358Q11.8485 29.1515 10.8642 28.1672L7.6971 25.0000L11.8485 20.8485L11.1358 20.1358Q10.1515 19.1515 9.1672 20.1358Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutShare = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 17H6Q7.4 17 7.4 18.4V24.6H19Q24.6 24.6 24.6 19V18.4Q24.6 17 26 17H27V19Q27 27 19 27H5Z" fill={color} fillRule="evenodd" /><Path d="M11.8328 9.8642L16.0000 5.6971L21.1515 10.8485L21.8642 10.1358Q22.8485 9.1515 21.8642 8.1672L16.0000 2.3029L9.1515 9.1515L9.8642 9.8642Q10.8485 10.8485 11.8328 9.8642Z" fill={color} fillRule="evenodd" /><Path d="M14.8000 5.8920L14.8000 20.0000L15.8080 20.0000Q17.2000 20.0000 17.2000 18.6080L17.2000 4.5000L16.1920 4.5000Q14.8000 4.5000 14.8000 5.8920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutSend = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M10.3920 7.2000L24.8000 7.2000L24.8000 23.0000L25.8080 23.0000Q27.2000 23.0000 27.2000 21.6080L27.2000 4.8000L9.0000 4.8000L9.0000 5.8080Q9.0000 7.2000 10.3920 7.2000Z" fill={color} fillRule="evenodd" /><Path d="M7.8328 25.8642L26.2485 7.4485L25.5358 6.7358Q24.5515 5.7515 23.5672 6.7358L5.1515 25.1515L5.8642 25.8642Q6.8485 26.8485 7.8328 25.8642Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutAdd = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M6.3920 17.2000L27.0000 17.2000L27.0000 16.1920Q27.0000 14.8000 25.6080 14.8000L5.0000 14.8000L5.0000 15.8080Q5.0000 17.2000 6.3920 17.2000Z" fill={color} fillRule="evenodd" /><Path d="M14.8000 6.3920L14.8000 27.0000L15.8080 27.0000Q17.2000 27.0000 17.2000 25.6080L17.2000 5.0000L16.1920 5.0000Q14.8000 5.0000 14.8000 6.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
// The plus's crossbar, for steppers and zoom pairs beside a plus.
export const CutMinus = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M6.3920 17.2000L27.0000 17.2000L27.0000 16.1920Q27.0000 14.8000 25.6080 14.8000L5.0000 14.8000L5.0000 15.8080Q5.0000 17.2000 6.3920 17.2000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutClose = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M7.1358 8.8328L24.1515 25.8485L24.8642 25.1358Q25.8485 24.1515 24.8642 23.1672L7.8485 6.1515L7.1358 6.8642Q6.1515 7.8485 7.1358 8.8328Z" fill={color} fillRule="evenodd" /><Path d="M23.1672 7.1358L6.1515 24.1515L6.8642 24.8642Q7.8485 25.8485 8.8328 24.8642L25.8485 7.8485L25.1358 7.1358Q24.1515 6.1515 23.1672 7.1358Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutBack = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M11.1672 6.1358L1.3029 16.0000L12.1515 26.8485L12.8642 26.1358Q13.8485 25.1515 12.8642 24.1672L4.6971 16.0000L13.8485 6.8485L13.1358 6.1358Q12.1515 5.1515 11.1672 6.1358Z" fill={color} fillRule="evenodd" /><Path d="M5.3920 17.2000L28.0000 17.2000L28.0000 16.1920Q28.0000 14.8000 26.6080 14.8000L4.0000 14.8000L4.0000 15.8080Q4.0000 17.2000 5.3920 17.2000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutNext = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M12.1358 7.8328L20.3029 16.0000L11.1515 25.1515L11.8642 25.8642Q12.8485 26.8485 13.8328 25.8642L23.6971 16.0000L12.8485 5.1515L12.1358 5.8642Q11.1515 6.8485 12.1358 7.8328Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutPlay = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M8 4L26.8 14.9Q28.5 16 26.8 17.1L8 28Z M10.5 8.4V23.6L23.8 16Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutPause = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9.1750 6.5370L9.1750 27.0000L10.2880 27.0000Q11.8250 27.0000 11.8250 25.4630L11.8250 5.0000L10.7120 5.0000Q9.1750 5.0000 9.1750 6.5370Z" fill={color} fillRule="evenodd" /><Path d="M20.1750 6.5370L20.1750 27.0000L21.2880 27.0000Q22.8250 27.0000 22.8250 25.4630L22.8250 5.0000L21.7120 5.0000Q20.1750 5.0000 20.1750 6.5370Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutMic = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M12 4H16Q20 4 20 8V15Q20 19 16 19Q12 19 12 15Z" fill={color} fillRule="evenodd" /><Path d="M6 12H7Q8.4 12 8.4 13.4V15Q8.4 23.6 16 23.6Q23.6 23.6 23.6 15V13.4Q23.6 12 25 12H26V15Q26 26 16 26Q6 26 6 15Z" fill={color} fillRule="evenodd" /><Path d="M14.8000 26.3920L14.8000 30.0000L15.8080 30.0000Q17.2000 30.0000 17.2000 28.6080L17.2000 25.0000L16.1920 25.0000Q14.8000 25.0000 14.8000 26.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutSettings = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5.3920 11.2000L8.5000 11.2000L8.5000 10.1920Q8.5000 8.8000 7.1080 8.8000L4.0000 8.8000L4.0000 9.8080Q4.0000 11.2000 5.3920 11.2000Z" fill={color} fillRule="evenodd" /><Path d="M16.8920 11.2000L28.0000 11.2000L28.0000 10.1920Q28.0000 8.8000 26.6080 8.8000L15.5000 8.8000L15.5000 9.8080Q15.5000 11.2000 16.8920 11.2000Z" fill={color} fillRule="evenodd" /><Path d="M5.3920 23.2000L16.5000 23.2000L16.5000 22.1920Q16.5000 20.8000 15.1080 20.8000L4.0000 20.8000L4.0000 21.8080Q4.0000 23.2000 5.3920 23.2000Z" fill={color} fillRule="evenodd" /><Path d="M24.8920 23.2000L28.0000 23.2000L28.0000 22.1920Q28.0000 20.8000 26.6080 20.8000L23.5000 20.8000L23.5000 21.8080Q23.5000 23.2000 24.8920 23.2000Z" fill={color} fillRule="evenodd" /><Path d="M8.5 6.5H12Q15.5 6.5 15.5 10V13.5H12Q8.5 13.5 8.5 10Z M16.5 18.5H20Q23.5 18.5 23.5 22V25.5H20Q16.5 25.5 16.5 22Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutDownload = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3.8000 22.3920L3.8000 28.2000L20.0000 28.2000L28.2000 28.2000L28.2000 21.0000L27.1920 21.0000Q25.8000 21.0000 25.8000 22.3920L25.8000 25.8000L20.0000 25.8000L6.2000 25.8000L6.2000 21.0000L5.1920 21.0000Q3.8000 21.0000 3.8000 22.3920Z" fill={color} fillRule="evenodd" /><Path d="M14.8000 5.3920L14.8000 21.0000L15.8080 21.0000Q17.2000 21.0000 17.2000 19.6080L17.2000 4.0000L16.1920 4.0000Q14.8000 4.0000 14.8000 5.3920Z" fill={color} fillRule="evenodd" /><Path d="M10.1358 16.8328L16.0000 22.6971L22.8485 15.8485L22.1358 15.1358Q21.1515 14.1515 20.1672 15.1358L16.0000 19.3029L10.8485 14.1515L10.1358 14.8642Q9.1515 15.8485 10.1358 16.8328Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutMenu = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M6.3920 9.2000L27.0000 9.2000L27.0000 8.1920Q27.0000 6.8000 25.6080 6.8000L5.0000 6.8000L5.0000 7.8080Q5.0000 9.2000 6.3920 9.2000Z" fill={color} fillRule="evenodd" /><Path d="M6.3920 17.2000L22.0000 17.2000L22.0000 16.1920Q22.0000 14.8000 20.6080 14.8000L5.0000 14.8000L5.0000 15.8080Q5.0000 17.2000 6.3920 17.2000Z" fill={color} fillRule="evenodd" /><Path d="M6.3920 25.2000L27.0000 25.2000L27.0000 24.1920Q27.0000 22.8000 25.6080 22.8000L5.0000 22.8000L5.0000 23.8080Q5.0000 25.2000 6.3920 25.2000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutFeedShare = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9.3652 14.3627L21.1348 7.6373" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M9.3652 17.6373L20.0094 23.7196" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M3.25 12.75H6.5Q9.75 12.75 9.75 16V19.25H6.5Q3.25 19.25 3.25 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M20.75 2.75H24Q27.25 2.75 27.25 6V9.25H24Q20.75 9.25 20.75 6Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><G transform="rotate(-15.25511870 24 26)"><Path d="M20.75 22.75H24Q27.25 22.75 27.25 26V29.25H24Q20.75 29.25 20.75 26Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></G></Svg>
);
const CutDiamond = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9 5H22L28 13L16 28L4 13Z" fill={fill ?? "none"} stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M5.7470 14.0750L27.5000 14.0750L27.5000 13.1720Q27.5000 11.9250 26.2530 11.9250L4.5000 11.9250L4.5000 12.8280Q4.5000 14.0750 5.7470 14.0750Z" fill={color} fillRule="evenodd" /><Path d="M12 5L10 13L16 28L22 13L19 5" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.075} strokeLinejoin="round" /></Svg>
);
const CutBlog = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M16.5 5H10Q5 5 5 10V27H22Q27 27 27 22V15.5" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M21 3H24Q29 3 29 8V11H26Q21 11 21 6Z" fill={color} fillRule="evenodd" /><Path d="M11.3920 16.2000L21.0000 16.2000L21.0000 15.1920Q21.0000 13.8000 19.6080 13.8000L10.0000 13.8000L10.0000 14.8080Q10.0000 16.2000 11.3920 16.2000Z" fill={color} fillRule="evenodd" /><Path d="M11.3920 21.2000L17.0000 21.2000L17.0000 20.1920Q17.0000 18.8000 15.6080 18.8000L10.0000 18.8000L10.0000 19.8080Q10.0000 21.2000 11.3920 21.2000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutCommunities = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 13V9Q5 5 9 5Q13 5 13 9V13Z M20 15V11Q20 7 23.5 7Q27 7 27 11V15Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M4.2000 26.6080L4.2000 19.2000L10.0000 19.2000L10.0000 18.1920Q10.0000 16.8000 8.6080 16.8000L1.8000 16.8000L1.8000 28.0000L2.8080 28.0000Q4.2000 28.0000 4.2000 26.6080Z" fill={color} fillRule="evenodd"/><Path d="M10 18Q18 18 18 26V28 M22 20Q29 20 29 27V28" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/></Svg>
);
const CutArcade = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9 8H23Q26 8 26.8 12L29 26H26Q24 26 22.7 24.4L20 21H12L9.3 24.4Q8 26 6 26H3L5.2 12Q6 8 9 8Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="miter"/><Path d="M8 14H13.8V15.1Q13.8 16.2 12.7 16.2H8Z M9.8 12H12V17Q12 18.2 10.8 18.2H9.8Z" fill={color}/><Path d="M21.4 11.8H22.5Q23.6 11.8 23.6 12.9V14H22.5Q21.4 14 21.4 12.9Z M19.3 15.5H20.4Q21.5 15.5 21.5 16.6V17.7H20.4Q19.3 17.7 19.3 16.6Z M23.4 15.5H24.5Q25.6 15.5 25.6 16.6V17.7H24.5Q23.4 17.7 23.4 16.6Z" fill={color}/></Svg>
);
const CutAssistant = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M14.450 3.600L14.900 3.600Q17.550 3.600 17.550 6.250C17.550 11.000 21.000 14.450 28.400 14.450L28.400 14.900Q28.400 17.550 25.750 17.550C21.000 17.550 17.550 21.000 17.550 28.400L17.100 28.400Q14.450 28.400 14.450 25.750C14.450 21.000 11.000 17.550 3.600 17.550L3.600 17.100Q3.600 14.450 6.250 14.450C11.000 14.450 14.450 11.000 14.450 3.600Z M16.000 10.600C17.458 12.976 19.024 14.542 21.400 16.000C19.024 17.458 17.458 19.024 16.000 21.400C14.542 19.024 12.976 17.458 10.600 16.000C12.976 14.542 14.542 12.976 16.000 10.600Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutCommand = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 5H11Q14 5 14 8V18H4Z M19 5H24Q28 5 28 9V12H19Z M4 23H10Q14 23 14 27H4Z M19 17H24Q28 17 28 21V27H19Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutEvents = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 7H21Q27 7 27 13V27H11Q5 27 5 21Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M6.3920 15.2000L27.0000 15.2000L27.0000 14.1920Q27.0000 12.8000 25.6080 12.8000L5.0000 12.8000L5.0000 13.8080Q5.0000 15.2000 6.3920 15.2000Z" fill={color} fillRule="evenodd" /><Path d="M9.8000 4.3920L9.8000 10.0000L10.8080 10.0000Q12.2000 10.0000 12.2000 8.6080L12.2000 3.0000L11.1920 3.0000Q9.8000 3.0000 9.8000 4.3920Z" fill={color} fillRule="evenodd" /><Path d="M19.8000 4.3920L19.8000 10.0000L20.8080 10.0000Q22.2000 10.0000 22.2000 8.6080L22.2000 3.0000L21.1920 3.0000Q19.8000 3.0000 19.8000 4.3920Z" fill={color} fillRule="evenodd" /><Path d="M11 19H15Q18 19 18 22V24H14Q11 24 11 21Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutLeaderboard = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9 4H23V12Q23 20 16 20Q9 20 9 12Z M9 7H4V10Q4 16 10 16 M23 7H28V10Q28 16 22 16" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M14.8000 21.3920L14.8000 27.0000L15.8080 27.0000Q17.2000 27.0000 17.2000 25.6080L17.2000 20.0000L16.1920 20.0000Q14.8000 20.0000 14.8000 21.3920Z" fill={color} fillRule="evenodd" /><Path d="M11.3920 29.2000L22.0000 29.2000L22.0000 28.1920Q22.0000 26.8000 20.6080 26.8000L10.0000 26.8000L10.0000 27.8080Q10.0000 29.2000 11.3920 29.2000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutFeaturerequests = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M11 23V21C11 18 6 16 6 11A10 10 0 0 1 26 11C26 16 21 18 21 21V23Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M13.3920 29.2000L20.0000 29.2000L20.0000 28.1920Q20.0000 26.8000 18.6080 26.8000L12.0000 26.8000L12.0000 27.8080Q12.0000 29.2000 13.3920 29.2000Z" fill={color} fillRule="evenodd" /><Path d="M14.9500 10.2180L14.9500 17.0000L15.8320 17.0000Q17.0500 17.0000 17.0500 15.7820L17.0500 9.0000L16.1680 9.0000Q14.9500 9.0000 14.9500 10.2180Z" fill={color} fillRule="evenodd" /><Path d="M13.2180 14.0500L20.0000 14.0500L20.0000 13.1680Q20.0000 11.9500 18.7820 11.9500L12.0000 11.9500L12.0000 12.8320Q12.0000 14.0500 13.2180 14.0500Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutApps = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 4H14V10Q14 14 10 14H4Z M18 4H28V14H22Q18 14 18 10Z M4 18H10Q14 18 14 22V28H4Z M22 18H28V28H18V22Q18 18 22 18Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="miter" /></Svg>
);
const CutImages = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 5H21Q27 5 27 11V27H11Q5 27 5 21Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M5 23L12 15L18 21L22 17L27 22" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M19 9H21Q23 9 23 11V13H21Q19 13 19 11Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutVideo = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 7H15Q21 7 21 13V25H10Q4 25 4 19Z M21 13L28 9V24L21 20" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutMusic = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M14.2000 21.6080L14.2000 7.9701L25.8000 5.4844L25.8000 21.0000L26.8080 21.0000Q28.2000 21.0000 28.2000 19.6080L28.2000 2.5156L11.8000 6.0299L11.8000 23.0000L12.8080 23.0000Q14.2000 23.0000 14.2000 21.6080Z" fill={color} fillRule="evenodd" /><Path d="M13 23Q13 28 8 28Q4 28 4 24Q4 20 9 20H13 M27 21Q27 26 22 26Q18 26 18 22Q18 18 23 18H27" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutLive = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M13 12H16Q20 12 20 16V20H17Q13 20 13 16Z" fill={color} fillRule="evenodd" /><Path d="M10 9Q4 16 10 23 M23 9Q29 16 23 23 M6 5Q-2 16 6 27 M27 5Q35 16 27 27" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.05} strokeLinejoin="round" /></Svg>
);
const CutCamera = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 10H9L12 5H21L24 10H28V22Q28 27 23 27H4Z M22 18A6 6 0 1 1 10 18A6 6 0 1 1 22 18Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutUpload = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3.8000 22.3920L3.8000 28.2000L28.2000 28.2000L28.2000 21.0000L27.1920 21.0000Q25.8000 21.0000 25.8000 22.3920L25.8000 25.8000L6.2000 25.8000L6.2000 21.0000L5.1920 21.0000Q3.8000 21.0000 3.8000 22.3920Z" fill={color} fillRule="evenodd" /><Path d="M11.8328 10.8642L16.0000 6.6971L21.1515 11.8485L21.8642 11.1358Q22.8485 10.1515 21.8642 9.1672L16.0000 3.3029L9.1515 10.1515L9.8642 10.8642Q10.8485 11.8485 11.8328 10.8642Z" fill={color} fillRule="evenodd" /><Path d="M14.8000 6.3920L14.8000 22.0000L15.8080 22.0000Q17.2000 22.0000 17.2000 20.6080L17.2000 5.0000L16.1920 5.0000Q14.8000 5.0000 14.8000 6.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutAttach = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M10 17L19 8Q23 4 27 8Q30 11 26 15L14 27Q9 32 4 27Q0 23 5 18L17 6 M10 17L9 18Q7 20 9 22Q11 24 13 22L24 11" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutEdit = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 22L21 6Q23 4 25 6L27 8Q29 10 27 12L11 28H5Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M18.1358 10.8328L23.1515 15.8485L23.8642 15.1358Q24.8485 14.1515 23.8642 13.1672L18.8485 8.1515L18.1358 8.8642Q17.1515 9.8485 18.1358 10.8328Z" fill={color} fillRule="evenodd" /><Path d="M6.3920 29.2000L27.0000 29.2000L27.0000 28.1920Q27.0000 26.8000 25.6080 26.8000L5.0000 26.8000L5.0000 27.8080Q5.0000 29.2000 6.3920 29.2000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutWallet = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 10V7Q5 4 9 4H24V10 M5 10H22Q28 10 28 16V28H11Q5 28 5 22Z M28 16H21Q17 16 17 20V23H28" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M21 18.5H22Q23 18.5 23 19.5V21H22Q21 21 21 20Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutCoins = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M29 16A13 13 0 1 1 3 16A13 13 0 1 1 29 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} /><G transform="translate(16 16) scale(.59) translate(-16 -16) rotate(180 16 16)"><Path d="M16.237 29.447L13.917 29.447L13.917 17.160L13.970 17.160L13.970 16.896L14.022 16.896L14.022 16.738L14.075 16.738L14.075 16.633L14.128 16.633L14.128 16.580L14.181 16.580L14.181 16.475L14.233 16.475L14.233 16.422L14.286 16.422L14.286 16.369L14.339 16.369L14.339 16.316L14.392 16.316L14.392 16.264L14.444 16.264L14.444 16.211L14.497 16.211L14.497 16.158L14.550 16.158L14.550 16.105L14.655 16.105L14.655 16.053L14.761 16.053L14.761 16.000L14.866 16.000L14.866 15.947L14.972 15.947L14.972 15.895L15.130 15.895L15.130 15.842L15.341 15.842L15.341 15.789L17.661 15.789L17.661 28.287L17.608 28.287L17.608 28.445L17.556 28.445L17.556 28.551L17.503 28.551L17.503 28.656L17.450 28.656L17.450 28.709L17.397 28.709L17.397 28.814L17.345 28.814L17.345 28.867L17.292 28.867L17.292 28.920L17.239 28.920L17.239 28.973L17.187 28.973L17.187 29.025L17.134 29.025L17.134 29.078L17.028 29.078L17.028 29.131L16.976 29.131L16.976 29.184L16.870 29.184L16.870 29.236L16.765 29.236L16.765 29.289L16.659 29.289L16.659 29.342L16.501 29.342L16.501 29.395L16.237 29.395L16.237 29.447ZM26.257 23.383L24.147 23.383L24.147 23.330L23.937 23.330L23.937 23.277L23.778 23.277L23.778 23.225L23.673 23.225L23.673 23.172L23.567 23.172L23.567 23.119L23.515 23.119L23.515 23.066L23.409 23.066L23.409 23.014L23.356 23.014L23.356 22.961L23.304 22.961L23.304 22.908L23.198 22.908L23.198 22.855L23.146 22.855L23.146 22.750L23.093 22.750L23.093 22.697L23.040 22.697L23.040 22.645L22.987 22.645L22.987 22.592L22.935 22.592L22.935 22.486L22.882 22.486L22.882 22.434L22.829 22.434L22.829 22.328L22.776 22.328L22.776 22.170L22.724 22.170L22.724 22.064L22.671 22.064L22.671 21.854L22.618 21.854L22.618 12.625L22.565 12.625L22.565 11.939L22.513 11.939L22.513 11.676L22.460 11.676L22.460 11.412L22.407 11.412L22.407 11.201L22.354 11.201L22.354 10.990L22.302 10.990L22.302 10.832L22.249 10.832L22.249 10.674L22.196 10.674L22.196 10.516L22.144 10.516L22.144 10.410L22.091 10.410L22.091 10.252L22.038 10.252L22.038 10.146L21.985 10.146L21.985 10.041L21.933 10.041L21.933 9.936L21.880 9.936L21.880 9.830L21.827 9.830L21.827 9.725L21.774 9.725L21.774 9.619L21.722 9.619L21.722 9.514L21.669 9.514L21.669 9.408L21.616 9.408L21.616 9.355L21.563 9.355L21.563 9.250L21.511 9.250L21.511 9.197L21.458 9.197L21.458 9.092L21.405 9.092L21.405 9.039L21.353 9.039L21.353 8.986L21.300 8.986L21.300 8.881L21.247 8.881L21.247 8.828L21.194 8.828L21.194 8.775L21.142 8.775L21.142 8.670L21.089 8.670L21.089 8.617L21.036 8.617L21.036 8.564L20.983 8.564L20.983 8.512L20.931 8.512L20.931 8.459L20.878 8.459L20.878 8.406L20.825 8.406L20.825 8.301L20.772 8.301L20.772 8.248L20.720 8.248L20.720 8.195L20.667 8.195L20.667 8.143L20.614 8.143L20.614 8.090L20.562 8.090L20.562 8.037L20.509 8.037L20.509 7.984L20.456 7.984L20.456 7.932L20.351 7.932L20.351 7.879L20.298 7.879L20.298 7.826L20.245 7.826L20.245 7.773L20.192 7.773L20.192 7.721L20.140 7.721L20.140 7.668L20.034 7.668L20.034 7.615L19.981 7.615L19.981 7.562L19.929 7.562L19.929 7.510L19.823 7.510L19.823 7.457L19.771 7.457L19.771 7.404L19.665 7.404L19.665 7.352L19.612 7.352L19.612 7.299L19.507 7.299L19.507 7.246L19.454 7.246L19.454 7.193L19.349 7.193L19.349 7.141L19.243 7.141L19.243 7.088L19.190 7.088L19.190 7.035L19.085 7.035L19.085 6.982L18.979 6.982L18.979 6.930L18.874 6.930L18.874 6.877L18.769 6.877L18.769 6.824L18.663 6.824L18.663 6.771L18.610 6.771L18.610 6.719L18.558 6.719L18.558 6.666L18.452 6.666L18.452 6.613L18.399 6.613L18.399 6.561L18.347 6.561L18.347 6.508L18.294 6.508L18.294 6.455L18.241 6.455L18.241 6.402L18.188 6.402L18.188 6.297L18.136 6.297L18.136 6.244L18.083 6.244L18.083 6.139L18.030 6.139L18.030 6.086L17.978 6.086L17.978 5.980L17.925 5.980L17.925 5.822L17.872 5.822L17.872 5.664L17.819 5.664L17.819 5.453L17.767 5.453L17.767 2.658L17.978 2.658L17.978 2.711L18.083 2.711L18.083 2.764L18.241 2.764L18.241 2.816L18.452 2.816L18.452 2.869L18.610 2.869L18.610 2.922L18.769 2.922L18.769 2.975L18.927 2.975L18.927 3.027L19.085 3.027L19.085 3.080L19.243 3.080L19.243 3.133L19.401 3.133L19.401 3.186L19.560 3.186L19.560 3.238L19.718 3.238L19.718 3.291L19.823 3.291L19.823 3.344L19.981 3.344L19.981 3.396L20.087 3.396L20.087 3.449L20.192 3.449L20.192 3.502L20.298 3.502L20.298 3.555L20.456 3.555L20.456 3.607L20.509 3.607L20.509 3.660L20.614 3.660L20.614 3.713L20.720 3.713L20.720 3.766L20.825 3.766L20.825 3.818L20.931 3.818L20.931 3.871L21.036 3.871L21.036 3.924L21.142 3.924L21.142 3.977L21.194 3.977L21.194 4.029L21.300 4.029L21.300 4.082L21.405 4.082L21.405 4.135L21.458 4.135L21.458 4.188L21.563 4.188L21.563 4.240L21.669 4.240L21.669 4.293L21.722 4.293L21.722 4.346L21.774 4.346L21.774 4.398L21.880 4.398L21.880 4.451L21.933 4.451L21.933 4.504L22.038 4.504L22.038 4.557L22.091 4.557L22.091 4.609L22.144 4.609L22.144 4.662L22.249 4.662L22.249 4.715L22.302 4.715L22.302 4.768L22.354 4.768L22.354 4.820L22.407 4.820L22.407 4.873L22.513 4.873L22.513 4.926L22.565 4.926L22.565 4.979L22.618 4.979L22.618 5.031L22.671 5.031L22.671 5.084L22.724 5.084L22.724 5.137L22.829 5.137L22.829 5.189L22.882 5.189L22.882 5.242L22.935 5.242L22.935 5.295L22.987 5.295L22.987 5.348L23.040 5.348L23.040 5.400L23.093 5.400L23.093 5.453L23.146 5.453L23.146 5.506L23.198 5.506L23.198 5.559L23.251 5.559L23.251 5.611L23.304 5.611L23.304 5.664L23.356 5.664L23.356 5.717L23.409 5.717L23.409 5.770L23.462 5.770L23.462 5.822L23.515 5.822L23.515 5.875L23.567 5.875L23.567 5.928L23.620 5.928L23.620 5.980L23.673 5.980L23.673 6.033L23.726 6.033L23.726 6.139L23.778 6.139L23.778 6.191L23.831 6.191L23.831 6.244L23.884 6.244L23.884 6.297L23.937 6.297L23.937 6.350L23.989 6.350L23.989 6.455L24.042 6.455L24.042 6.508L24.095 6.508L24.095 6.561L24.147 6.561L24.147 6.613L24.200 6.613L24.200 6.719L24.253 6.719L24.253 6.771L24.306 6.771L24.306 6.877L24.358 6.877L24.358 6.930L24.411 6.930L24.411 6.982L24.464 6.982L24.464 7.088L24.517 7.088L24.517 7.141L24.569 7.141L24.569 7.246L24.622 7.246L24.622 7.352L24.675 7.352L24.675 7.404L24.728 7.404L24.728 7.510L24.780 7.510L24.780 7.562L24.833 7.562L24.833 7.668L24.886 7.668L24.886 7.773L24.938 7.773L24.938 7.826L24.991 7.826L24.991 7.932L25.044 7.932L25.044 8.037L25.097 8.037L25.097 8.143L25.149 8.143L25.149 8.248L25.202 8.248L25.202 8.354L25.255 8.354L25.255 8.459L25.308 8.459L25.308 8.564L25.360 8.564L25.360 8.723L25.413 8.723L25.413 8.828L25.466 8.828L25.466 8.934L25.519 8.934L25.519 9.092L25.571 9.092L25.571 9.250L25.624 9.250L25.624 9.355L25.677 9.355L25.677 9.514L25.729 9.514L25.729 9.672L25.782 9.672L25.782 9.830L25.835 9.830L25.835 10.041L25.888 10.041L25.888 10.199L25.940 10.199L25.940 10.410L25.993 10.410L25.993 10.621L26.046 10.621L26.046 10.885L26.099 10.885L26.099 11.201L26.151 11.201L26.151 11.570L26.204 11.570L26.204 12.045L26.257 12.045L26.257 23.383ZM7.800 23.383L5.743 23.383L5.743 23.330L5.690 23.330L5.690 23.277L5.743 23.277L5.743 11.781L5.796 11.781L5.796 11.412L5.849 11.412L5.849 11.096L5.901 11.096L5.901 10.779L5.954 10.779L5.954 10.516L6.007 10.516L6.007 10.305L6.060 10.305L6.060 10.146L6.112 10.146L6.112 9.936L6.165 9.936L6.165 9.777L6.218 9.777L6.218 9.566L6.271 9.566L6.271 9.461L6.323 9.461L6.323 9.303L6.376 9.303L6.376 9.145L6.429 9.145L6.429 8.986L6.481 8.986L6.481 8.881L6.534 8.881L6.534 8.775L6.587 8.775L6.587 8.617L6.640 8.617L6.640 8.512L6.692 8.512L6.692 8.406L6.745 8.406L6.745 8.301L6.798 8.301L6.798 8.195L6.851 8.195L6.851 8.090L6.903 8.090L6.903 7.984L6.956 7.984L6.956 7.879L7.009 7.879L7.009 7.826L7.062 7.826L7.062 7.721L7.114 7.721L7.114 7.615L7.167 7.615L7.167 7.562L7.220 7.562L7.220 7.457L7.272 7.457L7.272 7.352L7.325 7.352L7.325 7.299L7.378 7.299L7.378 7.193L7.431 7.193L7.431 7.141L7.483 7.141L7.483 7.035L7.536 7.035L7.536 6.982L7.589 6.982L7.589 6.877L7.642 6.877L7.642 6.824L7.694 6.824L7.694 6.719L7.747 6.719L7.747 6.666L7.800 6.666L7.800 6.613L7.853 6.613L7.853 6.508L7.905 6.508L7.905 6.455L7.958 6.455L7.958 6.402L8.011 6.402L8.011 6.350L8.063 6.350L8.063 6.297L8.116 6.297L8.116 6.191L8.169 6.191L8.169 6.139L8.222 6.139L8.222 6.086L8.274 6.086L8.274 6.033L8.327 6.033L8.327 5.980L8.380 5.980L8.380 5.928L8.433 5.928L8.433 5.875L8.485 5.875L8.485 5.770L8.538 5.770L8.538 5.717L8.591 5.717L8.591 5.664L8.644 5.664L8.644 5.611L8.696 5.611L8.696 5.559L8.749 5.559L8.749 5.506L8.802 5.506L8.802 5.453L8.854 5.453L8.854 5.400L8.907 5.400L8.907 5.348L9.013 5.348L9.013 5.295L9.065 5.295L9.065 5.242L9.118 5.242L9.118 5.189L9.171 5.189L9.171 5.137L9.224 5.137L9.224 5.084L9.276 5.084L9.276 5.031L9.329 5.031L9.329 4.979L9.435 4.979L9.435 4.926L9.487 4.926L9.487 4.873L9.540 4.873L9.540 4.820L9.593 4.820L9.593 4.768L9.646 4.768L9.646 4.715L9.751 4.715L9.751 4.662L9.804 4.662L9.804 4.609L9.856 4.609L9.856 4.557L9.962 4.557L9.962 4.504L10.015 4.504L10.015 4.451L10.120 4.451L10.120 4.398L10.173 4.398L10.173 4.346L10.278 4.346L10.278 4.293L10.331 4.293L10.331 4.240L10.437 4.240L10.437 4.188L10.489 4.188L10.489 4.135L10.595 4.135L10.595 4.082L10.647 4.082L10.647 4.029L10.753 4.029L10.753 3.977L10.858 3.977L10.858 3.924L10.964 3.924L10.964 3.871L11.017 3.871L11.017 3.818L11.122 3.818L11.122 3.766L11.228 3.766L11.228 3.713L11.333 3.713L11.333 3.660L11.438 3.660L11.438 3.607L11.544 3.607L11.544 3.555L11.649 3.555L11.649 3.502L11.755 3.502L11.755 3.449L11.913 3.449L11.913 3.396L12.019 3.396L12.019 3.344L12.124 3.344L12.124 3.291L12.282 3.291L12.282 3.238L12.440 3.238L12.440 3.186L12.599 3.186L12.599 3.133L12.757 3.133L12.757 3.080L12.915 3.080L12.915 3.027L13.073 3.027L13.073 2.975L13.231 2.975L13.231 2.922L13.390 2.922L13.390 2.869L13.548 2.869L13.548 2.816L13.706 2.816L13.706 2.764L13.864 2.764L13.864 2.711L14.022 2.711L14.022 2.658L14.181 2.658L14.181 5.559L14.128 5.559L14.128 5.770L14.075 5.770L14.075 5.875L14.022 5.875L14.022 6.033L13.970 6.033L13.970 6.139L13.917 6.139L13.917 6.191L13.864 6.191L13.864 6.297L13.812 6.297L13.812 6.350L13.759 6.350L13.759 6.402L13.706 6.402L13.706 6.455L13.653 6.455L13.653 6.508L13.601 6.508L13.601 6.561L13.548 6.561L13.548 6.613L13.495 6.613L13.495 6.666L13.442 6.666L13.442 6.719L13.390 6.719L13.390 6.771L13.284 6.771L13.284 6.824L13.179 6.824L13.179 6.877L13.126 6.877L13.126 6.930L13.021 6.930L13.021 6.982L12.915 6.982L12.915 7.035L12.810 7.035L12.810 7.088L12.704 7.088L12.704 7.141L12.599 7.141L12.599 7.193L12.546 7.193L12.546 7.246L12.440 7.246L12.440 7.299L12.388 7.299L12.388 7.352L12.282 7.352L12.282 7.404L12.229 7.404L12.229 7.457L12.124 7.457L12.124 7.510L12.071 7.510L12.071 7.562L12.019 7.562L12.019 7.615L11.913 7.615L11.913 7.668L11.860 7.668L11.860 7.721L11.808 7.721L11.808 7.773L11.702 7.773L11.702 7.826L11.649 7.826L11.649 7.879L11.597 7.879L11.597 7.932L11.544 7.932L11.544 7.984L11.491 7.984L11.491 8.037L11.438 8.037L11.438 8.090L11.386 8.090L11.386 8.143L11.333 8.143L11.333 8.195L11.280 8.195L11.280 8.248L11.228 8.248L11.228 8.301L11.175 8.301L11.175 8.354L11.122 8.354L11.122 8.406L11.069 8.406L11.069 8.459L11.017 8.459L11.017 8.512L10.964 8.512L10.964 8.564L10.911 8.564L10.911 8.670L10.858 8.670L10.858 8.723L10.806 8.723L10.806 8.775L10.753 8.775L10.753 8.881L10.700 8.881L10.700 8.934L10.647 8.934L10.647 8.986L10.595 8.986L10.595 9.092L10.542 9.092L10.542 9.145L10.489 9.145L10.489 9.250L10.437 9.250L10.437 9.303L10.384 9.303L10.384 9.408L10.331 9.408L10.331 9.514L10.278 9.514L10.278 9.566L10.226 9.566L10.226 9.672L10.173 9.672L10.173 9.777L10.120 9.777L10.120 9.883L10.067 9.883L10.067 9.988L10.015 9.988L10.015 10.094L9.962 10.094L9.962 10.199L9.909 10.199L9.909 10.305L9.856 10.305L9.856 10.463L9.804 10.463L9.804 10.568L9.751 10.568L9.751 10.727L9.698 10.727L9.698 10.885L9.646 10.885L9.646 11.096L9.593 11.096L9.593 11.307L9.540 11.307L9.540 11.518L9.487 11.518L9.487 11.834L9.435 11.834L9.435 12.256L9.382 12.256L9.382 21.748L9.329 21.748L9.329 22.012L9.276 22.012L9.276 22.170L9.224 22.170L9.224 22.275L9.171 22.275L9.171 22.381L9.118 22.381L9.118 22.486L9.065 22.486L9.065 22.539L9.013 22.539L9.013 22.592L8.960 22.592L8.960 22.697L8.907 22.697L8.907 22.750L8.854 22.750L8.854 22.803L8.802 22.803L8.802 22.855L8.749 22.855L8.749 22.908L8.696 22.908L8.696 22.961L8.644 22.961L8.644 23.014L8.538 23.014L8.538 23.066L8.485 23.066L8.485 23.119L8.380 23.119L8.380 23.172L8.274 23.172L8.274 23.225L8.169 23.225L8.169 23.277L8.011 23.277L8.011 23.330L7.800 23.330L7.800 23.383Z" fill={color} fillRule="evenodd" /></G></Svg>
);
const CutStore = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 12L7 5H25L28 12V15Q24 19 20 15Q16 19 12 15Q8 19 4 15Z M6 18V28H26V18 M13 28V21H20V28" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M10.6366 6.2324L9.8093 12.8512L10.8095 12.9762Q12.1907 13.1488 12.3634 11.7676L13.1907 5.1488L12.1905 5.0238Q10.8093 4.8512 10.6366 6.2324Z" fill={color} fillRule="evenodd" /><Path d="M18.9819 6.5301L19.8093 13.1488L20.8095 13.0238Q22.1907 12.8512 22.0181 11.4699L21.1907 4.8512L20.1905 4.9762Q18.8093 5.1488 18.9819 6.5301Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutSecurity = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M16 3L27 7V16Q27 24 16 29Q5 24 5 16V7Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M10.1358 16.8328L14.0000 20.6971L22.8485 11.8485L22.1358 11.1358Q21.1515 10.1515 20.1672 11.1358L14.0000 17.3029L10.8485 14.1515L10.1358 14.8642Q9.1515 15.8485 10.1358 16.8328Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutDislike = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="rotate(180 16 16)"><Path d="M10 27V15L15 5H16Q19 5 19 8V13H26V20Q26 27 19 27Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M3.8 15H5Q6.2 15 6.2 16.4V27H5Q3.8 27 3.8 25.6Z" fill={color} fillRule="evenodd" /></G></Svg>
);
const CutReply = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M10.1672 5.1358L2.3029 13.0000L11.1515 21.8485L11.8642 21.1358Q12.8485 20.1515 11.8642 19.1672L5.6971 13.0000L12.8485 5.8485L12.1358 5.1358Q11.1515 4.1515 10.1672 5.1358Z" fill={color} fillRule="evenodd" /><Path d="M5 11.8H17Q28 11.8 28 23V27H27Q25.6 27 25.6 25.6V23Q25.6 14.2 17 14.2H5Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutQuote = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3.5 6.5H8Q13.5 6.5 13.5 12V16Q13.5 23.7 6.8 25.6Q5.5 26 5.05 24.785L4.5 23.3Q9.5 21.8 10.2 17H7.5Q3.5 17 3.5 13Z" fill={color} fillRule="evenodd" /><G transform="translate(15 0)"><Path d="M3.5 6.5H8Q13.5 6.5 13.5 12V16Q13.5 23.7 6.8 25.6Q5.5 26 5.05 24.785L4.5 23.3Q9.5 21.8 10.2 17H7.5Q3.5 17 3.5 13Z" fill={color} fillRule="evenodd" /></G></Svg>
);
const CutCopy = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3 3H19.6Q21 3 21 4.4V5.4H5.4V21.6Q5.4 23 4 23H3Z" fill={color} /><Path d="M10 10H21Q27 10 27 16V28H16Q10 28 10 22Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutLink = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M12 10L16 6Q22 0 27 5Q32 10 26 16L22 20 M10 12L6 16Q0 22 5 27Q10 32 16 26L20 22" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M12.8328 20.8642L21.8485 11.8485L21.1358 11.1358Q20.1515 10.1515 19.1672 11.1358L10.1515 20.1515L10.8642 20.8642Q11.8485 21.8485 12.8328 20.8642Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutRefresh = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M26 12A11 11 0 0 0 6 9 M6 20A11 11 0 0 0 26 23" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M24.8000 6.3920L24.8000 10.8000L19.0000 10.8000L19.0000 11.8080Q19.0000 13.2000 20.3920 13.2000L27.2000 13.2000L27.2000 5.0000L26.1920 5.0000Q24.8000 5.0000 24.8000 6.3920Z" fill={color} fillRule="evenodd" /><Path d="M7.2000 25.6080L7.2000 21.2000L13.0000 21.2000L13.0000 20.1920Q13.0000 18.8000 11.6080 18.8000L4.8000 18.8000L4.8000 27.0000L5.8080 27.0000Q7.2000 27.0000 7.2000 25.6080Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutFilter = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 5H28L17.2 17V26.6Q17.2 28 15.8 28H14.8V17Z M9.4 7.4L16 14.6L22.6 7.4Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutSort = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M6.3920 8.2000L23.0000 8.2000L23.0000 7.1920Q23.0000 5.8000 21.6080 5.8000L5.0000 5.8000L5.0000 6.8080Q5.0000 8.2000 6.3920 8.2000Z" fill={color} fillRule="evenodd" /><Path d="M6.3920 15.2000L17.0000 15.2000L17.0000 14.1920Q17.0000 12.8000 15.6080 12.8000L5.0000 12.8000L5.0000 13.8080Q5.0000 15.2000 6.3920 15.2000Z" fill={color} fillRule="evenodd" /><Path d="M6.3920 22.2000L11.0000 22.2000L11.0000 21.1920Q11.0000 19.8000 9.6080 19.8000L5.0000 19.8000L5.0000 20.8080Q5.0000 22.2000 6.3920 22.2000Z" fill={color} fillRule="evenodd" /><Path d="M23.8000 16.3920L23.8000 28.0000L24.8080 28.0000Q26.2000 28.0000 26.2000 26.6080L26.2000 15.0000L25.1920 15.0000Q23.8000 15.0000 23.8000 16.3920Z" fill={color} fillRule="evenodd" /><Path d="M21.1358 25.8328L25.0000 29.6971L29.8485 24.8485L29.1358 24.1358Q28.1515 23.1515 27.1672 24.1358L25.0000 26.3029L21.8485 23.1515L21.1358 23.8642Q20.1515 24.8485 21.1358 25.8328Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutMore = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 14H5.8Q8 14 8 16.2V18H6.2Q4 18 4 15.8Z" fill={color} fillRule="evenodd" /><Path d="M14 14H15.8Q18 14 18 16.2V18H16.2Q14 18 14 15.8Z" fill={color} fillRule="evenodd" /><Path d="M24 14H25.8Q28 14 28 16.2V18H26.2Q24 18 24 15.8Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutDelete = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M7 10H25V22Q25 28 19 28H7Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M5.3920 8.2000L28.0000 8.2000L28.0000 7.1920Q28.0000 5.8000 26.6080 5.8000L4.0000 5.8000L4.0000 6.8080Q4.0000 8.2000 5.3920 8.2000Z" fill={color} fillRule="evenodd" /><Path d="M12 7V3H17Q20 3 20 6V7" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M11.9500 14.2180L11.9500 23.0000L12.8320 23.0000Q14.0500 23.0000 14.0500 21.7820L14.0500 13.0000L13.1680 13.0000Q11.9500 13.0000 11.9500 14.2180Z" fill={color} fillRule="evenodd" /><Path d="M17.9500 14.2180L17.9500 23.0000L18.8320 23.0000Q20.0500 23.0000 20.0500 21.7820L20.0500 13.0000L19.1680 13.0000Q17.9500 13.0000 17.9500 14.2180Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutCheck = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5.1527 18.0619L12.0000 24.9092L27.9546 8.9546L27.1527 8.1527Q26.0454 7.0454 24.9381 8.1527L12.0000 21.0908L5.9546 15.0454L5.1527 15.8473Q4.0454 16.9546 5.1527 18.0619Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutOpenexternally = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M18.3920 6.2000L25.8000 6.2000L25.8000 15.0000L26.8080 15.0000Q28.2000 15.0000 28.2000 13.6080L28.2000 3.8000L17.0000 3.8000L17.0000 4.8080Q17.0000 6.2000 18.3920 6.2000Z" fill={color} fillRule="evenodd" /><Path d="M15.8328 17.8642L27.8485 5.8485L27.1358 5.1358Q26.1515 4.1515 25.1672 5.1358L13.1515 17.1515L13.8642 17.8642Q14.8485 18.8485 15.8328 17.8642Z" fill={color} fillRule="evenodd" /><Path d="M5 9H13V11.4H7.4V24.6H19Q24.6 24.6 24.6 19V18H27V19Q27 27 19 27H5Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutVolume = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 12H9L17 5V27L9 20H4Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M22 10Q28 16 22 22 M26 6Q35 16 26 26" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.1} strokeLinejoin="round" /></Svg>
);
const CutMute = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 12H9L17 5V27L9 20H4Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M22.0135 13.8378L28.0969 20.7902L28.8555 20.1264Q29.9031 19.2098 28.9865 18.1622L22.9031 11.2098L22.1445 11.8736Q21.0969 12.7902 22.0135 13.8378Z" fill={color} fillRule="evenodd" /><Path d="M27.1803 12.2574L21.0969 19.2098L21.8555 19.8736Q22.9031 20.7902 23.8197 19.7426L29.9031 12.7902L29.1445 12.1264Q28.0969 11.2098 27.1803 12.2574Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutMicoff = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => {
  const maskId = React.useId().replace(/:/g, "");
  return (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Defs ><Mask id={maskId}><Rect width="32" height="32" fill="white" /><Path d="M3 3L29 29" stroke="black" strokeWidth={Number(strokeWidth) * 3.0} /></Mask></Defs><G mask={`url(#${maskId})`}><Path d="M12 4H16Q20 4 20 8V15Q20 19 16 19Q12 19 12 15Z" fill={color} fillRule="evenodd" /><Path d="M6 12H7Q8.4 12 8.4 13.4V15Q8.4 23.6 16 23.6Q23.6 23.6 23.6 15V13.4Q23.6 12 25 12H26V15Q26 26 16 26Q6 26 6 15Z" fill={color} fillRule="evenodd" /><Path d="M14.8000 26.3920L14.8000 30.0000L15.8080 30.0000Q17.2000 30.0000 17.2000 28.6080L17.2000 25.0000L16.1920 25.0000Q14.8000 25.0000 14.8000 26.3920Z" fill={color} fillRule="evenodd" /></G><Path d="M4.1358 5.8328L27.1515 28.8485L27.8642 28.1358Q28.8485 27.1515 27.8642 26.1672L4.8485 3.1515L4.1358 3.8642Q3.1515 4.8485 4.1358 5.8328Z" fill={color} fillRule="evenodd" /></Svg>
  );
};
const CutVideooff = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => {
  const maskId = React.useId().replace(/:/g, "");
  return (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Defs ><Mask id={maskId}><Rect width="32" height="32" fill="white" /><Path d="M3 3L29 29" stroke="black" strokeWidth={Number(strokeWidth) * 3.0} /></Mask></Defs><G mask={`url(#${maskId})`}><Path d="M4 7H15Q21 7 21 13V25H10Q4 25 4 19Z M21 13L28 9V24L21 20" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></G><Path d="M4.1358 5.8328L27.1515 28.8485L27.8642 28.1358Q28.8485 27.1515 27.8642 26.1672L4.8485 3.1515L4.1358 3.8642Q3.1515 4.8485 4.1358 5.8328Z" fill={color} fillRule="evenodd" /></Svg>
  );
};
const CutCaptions = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 6H21Q28 6 28 13V26H11Q4 26 4 19Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M14 11H11Q7.8 11 7.8 14.2V18Q7.8 21 11 21H14V18.8H11Q10 18.8 10 18V14.2Q10 13.2 11 13.2H14Z M24 11H21Q17.8 11 17.8 14.2V18Q17.8 21 21 21H24V18.8H21Q20 18.8 20 18V14.2Q20 13.2 21 13.2H24Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutFullscreen = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5.2000 10.6080L5.2000 5.2000L12.0000 5.2000L12.0000 4.1920Q12.0000 2.8000 10.6080 2.8000L2.8000 2.8000L2.8000 12.0000L3.8080 12.0000Q5.2000 12.0000 5.2000 10.6080Z" fill={color} fillRule="evenodd" /><Path d="M21.3920 5.2000L26.8000 5.2000L26.8000 12.0000L27.8080 12.0000Q29.2000 12.0000 29.2000 10.6080L29.2000 2.8000L20.0000 2.8000L20.0000 3.8080Q20.0000 5.2000 21.3920 5.2000Z" fill={color} fillRule="evenodd" /><Path d="M26.8000 21.3920L26.8000 26.8000L20.0000 26.8000L20.0000 27.8080Q20.0000 29.2000 21.3920 29.2000L29.2000 29.2000L29.2000 20.0000L28.1920 20.0000Q26.8000 20.0000 26.8000 21.3920Z" fill={color} fillRule="evenodd" /><Path d="M10.6080 26.8000L5.2000 26.8000L5.2000 20.0000L4.1920 20.0000Q2.8000 20.0000 2.8000 21.3920L2.8000 29.2000L12.0000 29.2000L12.0000 28.1920Q12.0000 26.8000 10.6080 26.8000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutPrevious = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="translate(32 0) scale(-1 1)"><Path d="M5 5L21 16L5 27Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M24.8000 6.3920L24.8000 27.0000L25.8080 27.0000Q27.2000 27.0000 27.2000 25.6080L27.2000 5.0000L26.1920 5.0000Q24.8000 5.0000 24.8000 6.3920Z" fill={color} fillRule="evenodd" /></G></Svg>
);
const CutNexttrack = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 5L21 16L5 27Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M24.8000 6.3920L24.8000 27.0000L25.8080 27.0000Q27.2000 27.0000 27.2000 25.6080L27.2000 5.0000L26.1920 5.0000Q24.8000 5.0000 24.8000 6.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutCrop = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M7.8000 4.3920L7.8000 24.2000L29.0000 24.2000L29.0000 23.1920Q29.0000 21.8000 27.6080 21.8000L10.2000 21.8000L10.2000 3.0000L9.1920 3.0000Q7.8000 3.0000 7.8000 4.3920Z" fill={color} fillRule="evenodd" /><Path d="M4.3920 10.2000L21.8000 10.2000L21.8000 29.0000L22.8080 29.0000Q24.2000 29.0000 24.2000 27.6080L24.2000 7.8000L3.0000 7.8000L3.0000 8.8080Q3.0000 10.2000 4.3920 10.2000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutTrim = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M10 9A4 4 0 1 1 2 9A4 4 0 1 1 10 9Z M10 25A4 4 0 1 1 2 25A4 4 0 1 1 10 25Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M9.2372 12.8225L27.1998 28.8943L27.8720 28.1431Q28.8002 27.1057 27.7628 26.1775L9.8002 10.1057L9.1280 10.8569Q8.1998 11.8943 9.2372 12.8225Z" fill={color} fillRule="evenodd" /><Path d="M10.8328 22.8642L28.8485 4.8485L28.1358 4.1358Q27.1515 3.1515 26.1672 4.1358L8.1515 22.1515L8.8642 22.8642Q9.8485 23.8485 10.8328 22.8642Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutUndo = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9.1672 4.1358L2.3029 11.0000L10.1515 18.8485L10.8642 18.1358Q11.8485 17.1515 10.8642 16.1672L5.6971 11.0000L11.8485 4.8485L11.1358 4.1358Q10.1515 3.1515 9.1672 4.1358Z" fill={color} fillRule="evenodd" /><Path d="M5 9.8H18Q28 9.8 28 19Q28 28 18 28H11V27Q11 25.6 12.4 25.6H18Q25.6 25.6 25.6 19Q25.6 12.2 18 12.2H5Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutRedo = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="translate(32 0) scale(-1 1)"><Path d="M9.1672 4.1358L2.3029 11.0000L10.1515 18.8485L10.8642 18.1358Q11.8485 17.1515 10.8642 16.1672L5.6971 11.0000L11.8485 4.8485L11.1358 4.1358Q10.1515 3.1515 9.1672 4.1358Z" fill={color} fillRule="evenodd" /><Path d="M5 9.8H18Q28 9.8 28 19Q28 28 18 28H11V27Q11 25.6 12.4 25.6H18Q25.6 25.6 25.6 19Q25.6 12.2 18 12.2H5Z" fill={color} fillRule="evenodd" /></G></Svg>
);
const CutPrivacy = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M7 14H20Q26 14 26 20V28H12Q7 28 7 23Z M11 14V9Q11 3 16.5 3Q22 3 22 9V14" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M15.3000 20.3920L15.3000 23.0000L16.3080 23.0000Q17.7000 23.0000 17.7000 21.6080L17.7000 19.0000L16.6920 19.0000Q15.3000 19.0000 15.3000 20.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutVisibility = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3 16Q8 6 16 6Q24 6 29 16Q24 26 16 26Q8 26 3 16Z M20 16A4 4 0 1 1 12 16A4 4 0 1 1 20 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutHidden = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => {
  const maskId = React.useId().replace(/:/g, "");
  return (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Defs ><Mask id={maskId}><Rect width="32" height="32" fill="white" /><Path d="M3 3L29 29" stroke="black" strokeWidth={Number(strokeWidth) * 3.0} /></Mask></Defs><G mask={`url(#${maskId})`}><Path d="M3 16Q8 6 16 6Q24 6 29 16Q24 26 16 26Q8 26 3 16Z M20 16A4 4 0 1 1 12 16A4 4 0 1 1 20 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></G><Path d="M4.1358 5.8328L27.1515 28.8485L27.8642 28.1358Q28.8485 27.1515 27.8642 26.1672L4.8485 3.1515L4.1358 3.8642Q3.1515 4.8485 4.1358 5.8328Z" fill={color} fillRule="evenodd" /></Svg>
  );
};
const CutAddaccount = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9 4H13Q18 4 18 9Q18 14 13 14H9Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M3 28V19H13Q22 19 22 27V28H21Q19.6 28 19.6 26.6Q19.4 21.4 13 21.4H5.4V26.6Q5.4 28 4 28Z" fill={color} fillRule="evenodd" /><Path d="M24.2760 11.1000L31.0000 11.1000L31.0000 10.1760Q31.0000 8.9000 29.7240 8.9000L23.0000 8.9000L23.0000 9.8240Q23.0000 11.1000 24.2760 11.1000Z" fill={color} fillRule="evenodd" /><Path d="M25.9000 7.2760L25.9000 14.0000L26.8240 14.0000Q28.1000 14.0000 28.1000 12.7240L28.1000 6.0000L27.1760 6.0000Q25.9000 6.0000 25.9000 7.2760Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutSwitchaccounts = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 5H7Q11 5 11 9Q11 13 7 13H4Z M21 19H24Q28 19 28 23Q28 27 24 27H21Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M16.3920 8.2000L25.8000 8.2000L25.8000 13.0000L26.8080 13.0000Q28.2000 13.0000 28.2000 11.6080L28.2000 5.8000L15.0000 5.8000L15.0000 6.8080Q15.0000 8.2000 16.3920 8.2000Z" fill={color} fillRule="evenodd" /><Path d="M23.1358 11.8328L27.0000 15.6971L31.8485 10.8485L31.1358 10.1358Q30.1515 9.1515 29.1672 10.1358L27.0000 12.3029L23.8485 9.1515L23.1358 9.8642Q22.1515 10.8485 23.1358 11.8328Z" fill={color} fillRule="evenodd" /><Path d="M15.6080 23.8000L6.2000 23.8000L6.2000 19.0000L5.1920 19.0000Q3.8000 19.0000 3.8000 20.3920L3.8000 26.2000L17.0000 26.2000L17.0000 25.1920Q17.0000 23.8000 15.6080 23.8000Z" fill={color} fillRule="evenodd" /><Path d="M2.8328 21.8642L5.0000 19.6971L8.1515 22.8485L8.8642 22.1358Q9.8485 21.1515 8.8642 20.1672L5.0000 16.3029L0.1515 21.1515L0.8642 21.8642Q1.8485 22.8485 2.8328 21.8642Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutSignout = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 4H12Q17 4 17 9V28H4Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M13.3920 17.2000L28.0000 17.2000L28.0000 16.1920Q28.0000 14.8000 26.6080 14.8000L12.0000 14.8000L12.0000 15.8080Q12.0000 17.2000 13.3920 17.2000Z" fill={color} fillRule="evenodd" /><Path d="M23.1358 12.8328L26.3029 16.0000L22.1515 20.1515L22.8642 20.8642Q23.8485 21.8485 24.8328 20.8642L29.6971 16.0000L23.8485 10.1515L23.1358 10.8642Q22.1515 11.8485 23.1358 12.8328Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutLanguage = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 5H18Q28 5 28 15V28H14Q4 28 4 18Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M9.1600 12.0000L18.0000 12.0000L18.0000 11.1600Q18.0000 10.0000 16.8400 10.0000L8.0000 10.0000L8.0000 10.8400Q8.0000 12.0000 9.1600 12.0000Z" fill={color} fillRule="evenodd" /><Path d="M12.0000 9.1600L12.0000 11.0000L12.8400 11.0000Q14.0000 11.0000 14.0000 9.8400L14.0000 8.0000L13.1600 8.0000Q12.0000 8.0000 12.0000 9.1600Z" fill={color} fillRule="evenodd" /><Path d="M16 11Q15 17 9 20 M10 13Q12 17 17 19" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.0} strokeLinejoin="round" /><Path d="M19.3524 23.2813L21.5000 17.7590L24.0680 24.3624L24.8509 24.0580Q25.9320 23.6376 25.5116 22.5564L21.5000 12.2410L17.0680 23.6376L17.8509 23.9420Q18.9320 24.3624 19.3524 23.2813Z" fill={color} fillRule="evenodd" /><Path d="M20.0440 21.9000L24.0000 21.9000L24.0000 21.1440Q24.0000 20.1000 22.9560 20.1000L19.0000 20.1000L19.0000 20.8560Q19.0000 21.9000 20.0440 21.9000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutAppearance = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M27 20A12 12 0 1 1 12 4Q8 13 15 19Q20 23 27 20Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutHelp = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} /><Path d="M12.3 12.6C12.3 8.5 19.7 8.5 19.7 12.6C19.7 15.2 16 15.4 16 18" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.1} /><Path d="M14.8 21H16Q17.2 21 17.2 22.2V23.4H16Q14.8 23.4 14.8 22.2Z" fill={color} /></Svg>
);
const CutInformation = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M6 4H17Q26 4 26 15V28H15Q6 28 6 17Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><G transform="translate(16 16) scale(0.7) translate(-16 -16)"><Path d="M14.8 14.192V24.4H15.808Q17.2 24.4 17.2 23.008V12.8H16.192Q14.8 12.8 14.8 14.192Z" fill={color} fillRule="evenodd" /><Path d="M14.8 7.4H16Q17.2 7.4 17.2 8.6V10H16Q14.8 10 14.8 8.8Z" fill={color} fillRule="evenodd" /></G></Svg>
);
const CutReport = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4.8000 5.3920L4.8000 29.0000L5.8080 29.0000Q7.2000 29.0000 7.2000 27.6080L7.2000 4.0000L6.1920 4.0000Q4.8000 4.0000 4.8000 5.3920Z" fill={color} fillRule="evenodd" /><Path d="M6 5H17.2Q22.8 5 22.8 10.6V17.8H11.6Q6 17.8 6 12.2" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutBlocked = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M7.7358 9.4328L23.5515 25.2485L24.2642 24.5358Q25.2485 23.5515 24.2642 22.5672L8.4485 6.7515L7.7358 7.4642Q6.7515 8.4485 7.7358 9.4328Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutDocs = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M16 9Q12 5 4 5V24Q12 24 16 28Q20 24 28 24V5Q20 5 16 9V28" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M8.8387 12.1889L11.7696 12.9216L11.9631 12.1475Q12.2304 11.0784 11.1613 10.8111L8.2304 10.0784L8.0369 10.8525Q7.7696 11.9216 8.8387 12.1889Z" fill={color} fillRule="evenodd" /><Path d="M21.2995 12.6544L24.2304 11.9216L24.0369 11.1475Q23.7696 10.0784 22.7005 10.3456L19.7696 11.0784L19.9631 11.8525Q20.2304 12.9216 21.2995 12.6544Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutGuide = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 8L12 4L21 8L28 4V25L21 29L12 25L4 29Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M11.0000 5.1600L11.0000 25.0000L11.8400 25.0000Q13.0000 25.0000 13.0000 23.8400L13.0000 4.0000L12.1600 4.0000Q11.0000 4.0000 11.0000 5.1600Z" fill={color} fillRule="evenodd" /><Path d="M20.0000 9.1600L20.0000 29.0000L20.8400 29.0000Q22.0000 29.0000 22.0000 27.8400L22.0000 8.0000L21.1600 8.0000Q20.0000 8.0000 20.0000 9.1600Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutStats = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M2.8000 5.3920L2.8000 29.2000L29.0000 29.2000L29.0000 28.1920Q29.0000 26.8000 27.6080 26.8000L5.2000 26.8000L5.2000 4.0000L4.1920 4.0000Q2.8000 4.0000 2.8000 5.3920Z" fill={color} fillRule="evenodd" /><Path d="M9 24V16H11Q14 16 14 19V24Z M18 24V7H20Q23 7 23 10V24Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutAdvertising = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 12H12L26 5V25L12 19H4Z M12 19L15 28H9L6 19" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M27.9000 13.2760L27.9000 18.0000L28.8240 18.0000Q30.1000 18.0000 30.1000 16.7240L30.1000 12.0000L29.1760 12.0000Q27.9000 12.0000 27.9000 13.2760Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutBounties = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 10H21Q28 10 28 17V28H11Q4 28 4 21Z M11 10V5H17Q21 5 21 9V10 M4 17Q16 24 28 17" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M14.8000 19.3920L14.8000 23.0000L15.8080 23.0000Q17.2000 23.0000 17.2000 21.6080L17.2000 18.0000L16.1920 18.0000Q14.8000 18.0000 14.8000 19.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutGovernance = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 17H27V27H10Q5 27 5 22Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M11.3920 22.2000L22.0000 22.2000L22.0000 21.1920Q22.0000 19.8000 20.6080 19.8000L10.0000 19.8000L10.0000 20.8080Q10.0000 22.2000 11.3920 22.2000Z" fill={color} fillRule="evenodd" /><Path d="M15.8 17L7 13L12 3L23 8L18.5 17" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M12.1018 11.3746L14.0000 13.2728L18.6364 8.6364L18.1018 8.1018Q17.3636 7.3636 16.6254 8.1018L14.0000 10.7272L12.6364 9.3636L12.1018 9.8982Q11.3636 10.6364 12.1018 11.3746Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutDAO = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 11L16 4L28 11Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M6.3920 29.2000L27.0000 29.2000L27.0000 28.1920Q27.0000 26.8000 25.6080 26.8000L5.0000 26.8000L5.0000 27.8080Q5.0000 29.2000 6.3920 29.2000Z" fill={color} fillRule="evenodd" /><Path d="M6.8000 16.3920L6.8000 24.0000L7.8080 24.0000Q9.2000 24.0000 9.2000 22.6080L9.2000 15.0000L8.1920 15.0000Q6.8000 15.0000 6.8000 16.3920Z" fill={color} fillRule="evenodd" /><Path d="M14.8000 16.3920L14.8000 24.0000L15.8080 24.0000Q17.2000 24.0000 17.2000 22.6080L17.2000 15.0000L16.1920 15.0000Q14.8000 15.0000 14.8000 16.3920Z" fill={color} fillRule="evenodd" /><Path d="M22.8000 16.3920L22.8000 24.0000L23.8080 24.0000Q25.2000 24.0000 25.2000 22.6080L25.2000 15.0000L24.1920 15.0000Q22.8000 15.0000 22.8000 16.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutStaking = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 5H21Q28 5 28 12V28H11Q4 28 4 21Z M22 16A6 6 0 1 1 10 16A6 6 0 1 1 22 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M15.0000 11.1600L15.0000 13.0000L15.8400 13.0000Q17.0000 13.0000 17.0000 11.8400L17.0000 10.0000L16.1600 10.0000Q15.0000 10.0000 15.0000 11.1600Z" fill={color} fillRule="evenodd" /><Path d="M15.0000 20.1600L15.0000 22.0000L15.8400 22.0000Q17.0000 22.0000 17.0000 20.8400L17.0000 19.0000L16.1600 19.0000Q15.0000 19.0000 15.0000 20.1600Z" fill={color} fillRule="evenodd" /><Path d="M11.1600 17.0000L13.0000 17.0000L13.0000 16.1600Q13.0000 15.0000 11.8400 15.0000L10.0000 15.0000L10.0000 15.8400Q10.0000 17.0000 11.1600 17.0000Z" fill={color} fillRule="evenodd" /><Path d="M20.1600 17.0000L22.0000 17.0000L22.0000 16.1600Q22.0000 15.0000 20.8400 15.0000L19.0000 15.0000L19.0000 15.8400Q19.0000 17.0000 20.1600 17.0000Z" fill={color} fillRule="evenodd" /><Path d="M6.1600 12.0000L7.0000 12.0000L7.0000 11.1600Q7.0000 10.0000 5.8400 10.0000L5.0000 10.0000L5.0000 10.8400Q5.0000 12.0000 6.1600 12.0000Z" fill={color} fillRule="evenodd" /><Path d="M6.1600 23.0000L7.0000 23.0000L7.0000 22.1600Q7.0000 21.0000 5.8400 21.0000L5.0000 21.0000L5.0000 21.8400Q5.0000 23.0000 6.1600 23.0000Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutFractions = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M14 4A12 12 0 1 0 28 18H14Z M19 3V13H29Q28 5 19 3Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutGifts = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 12H28V18H4Z M6 18H26V28H11Q6 28 6 23Z M16 12Q6 12 6 7Q6 3 10 4Q14 5 16 12Q18 5 22 4Q26 3 26 7Q26 12 16 12" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M14.8000 14.3920L14.8000 28.0000L15.8080 28.0000Q17.2000 28.0000 17.2000 26.6080L17.2000 13.0000L16.1920 13.0000Q14.8000 13.0000 14.8000 14.3920Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutLocation = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M16 29Q5 18 5 12A11 11 0 0 1 27 12Q27 18 16 29Z M20 12A4 4 0 1 1 12 12A4 4 0 1 1 20 12Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /></Svg>
);
const CutHistory = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 12A12 12 0 1 1 5 22" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M2.8000 6.3920L2.8000 13.2000L11.0000 13.2000L11.0000 12.1920Q11.0000 10.8000 9.6080 10.8000L5.2000 10.8000L5.2000 5.0000L4.1920 5.0000Q2.8000 5.0000 2.8000 6.3920Z" fill={color} fillRule="evenodd" /><Path d="M14.9000 10.2760L14.9000 17.6798L21.5081 20.9839L21.9213 20.1574Q22.4919 19.0161 21.3506 18.4455L17.1000 16.3202L17.1000 9.0000L16.1760 9.0000Q14.9000 9.0000 14.9000 10.2760Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutClock = ({ size = 24, color = "currentColor", strokeWidth = 2, fill, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" /><Path d="M14.9000 9.2760L14.9000 16.6798L21.5081 19.9839L21.9213 19.1574Q22.4919 18.0161 21.3506 17.4455L17.1000 15.3202L17.1000 8.0000L16.1760 8.0000Q14.9000 8.0000 14.9000 9.2760Z" fill={color} fillRule="evenodd" /></Svg>
);
const CutMoreVertical = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="rotate(90 16 16)"><Path d="M4 14H5.8Q8 14 8 16.2V18H6.2Q4 18 4 15.8Z" fill={color} fillRule="evenodd"/><Path d="M14 14H15.8Q18 14 18 16.2V18H16.2Q14 18 14 15.8Z" fill={color} fillRule="evenodd"/><Path d="M24 14H25.8Q28 14 28 16.2V18H26.2Q24 18 24 15.8Z" fill={color} fillRule="evenodd"/></G></Svg>
);
const CutPictureInPicture = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M12 26.7H10Q2.8 26.7 2.8 19.5V4.3H21Q29.2 4.3 29.2 12.5H26.8Q26.8 6.7 21 6.7H5.2V19.5Q5.2 24.3 10 24.3H12Z" fill={color}/><Path d="M15.8 15.3H23Q29.2 15.3 29.2 21.5V27.7H21Q15.8 27.7 15.8 22.5Z M18.2 17.7V22.5Q18.2 25.3 21 25.3H26.8V21.5Q26.8 17.7 23 17.7Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutFastForward = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3 6L14.8 14.9Q16.3 16 14.8 17.1L3 26Z M5.4 10.8V21.2L12.3 16Z M17 6L28.8 14.9Q30.3 16 28.8 17.1L17 26Z M19.4 10.8V21.2L26.3 16Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutRewind = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="translate(32 0) scale(-1 1)"><Path d="M3 6L14.8 14.9Q16.3 16 14.8 17.1L3 26Z M5.4 10.8V21.2L12.3 16Z M17 6L28.8 14.9Q30.3 16 28.8 17.1L17 26Z M19.4 10.8V21.2L26.3 16Z" fill={color} fillRule="evenodd"/></G></Svg>
);
const CutExitFullscreen = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="rotate(180 7.5 7.5)"><Path d="M5.2000 10.6080L5.2000 5.2000L12.0000 5.2000L12.0000 4.1920Q12.0000 2.8000 10.6080 2.8000L2.8000 2.8000L2.8000 12.0000L3.8080 12.0000Q5.2000 12.0000 5.2000 10.6080Z" fill={color} fillRule="evenodd"/></G><G transform="rotate(180 24.5 7.5)"><Path d="M21.3920 5.2000L26.8000 5.2000L26.8000 12.0000L27.8080 12.0000Q29.2000 12.0000 29.2000 10.6080L29.2000 2.8000L20.0000 2.8000L20.0000 3.8080Q20.0000 5.2000 21.3920 5.2000Z" fill={color} fillRule="evenodd"/></G><G transform="rotate(180 24.5 24.5)"><Path d="M26.8000 21.3920L26.8000 26.8000L20.0000 26.8000L20.0000 27.8080Q20.0000 29.2000 21.3920 29.2000L29.2000 29.2000L29.2000 20.0000L28.1920 20.0000Q26.8000 20.0000 26.8000 21.3920Z" fill={color} fillRule="evenodd"/></G><G transform="rotate(180 7.5 24.5)"><Path d="M10.6080 26.8000L5.2000 26.8000L5.2000 20.0000L4.1920 20.0000Q2.8000 20.0000 2.8000 21.3920L2.8000 29.2000L12.0000 29.2000L12.0000 28.1920Q12.0000 26.8000 10.6080 26.8000Z" fill={color} fillRule="evenodd"/></G></Svg>
);
const CutHandshake = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => {
  const maskId = React.useId().replace(/:/g, "");
  return <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="translate(1.3 1.3) scale(1.225)"><Defs><Mask id={maskId} maskUnits="userSpaceOnUse" x="-2" y="-2" width="30" height="30"><Rect x="-2" y="-2" width="30" height="30" fill="white"/><Path transform="translate(14 14) rotate(43.73)" d="M-1 -2H1.05V-.9H.95Q0 -.9 0 .05V1H-1Z" fill="black"/><Path transform="translate(11 16.7) rotate(42.97)" d="M-1 -2H1.05V-.9H.95Q0 -.9 0 .05V1H-1Z" fill="black"/></Mask></Defs><G mask={`url(#${maskId})`}><Path d="M3 5H8.6Q10 5 11 6 M21 5L18.7 5.4Q17.8 5.5 17 5L16.5 4.7Q13.6 3 10.8 5.4L7.9 8.3Q6.6 9.6 7.9 10.9Q9.1 12.1 10.4 10.9L12 9.3Q13.4 8 15 9.5L19 13.5Q20.4 15 19 16.3Q17.7 17.6 16.3 16.2L14 14 M16.3 16.2Q18.1 18 16.6 19.4Q15.1 20.8 13.5 19.2L11 16.7 M13.5 19.2Q15 20.7 13.4 22Q12.1 23 10.8 21.7C7.8 19.4 3 18.2 3 14" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 0.9} strokeLinejoin="round"/><Path d="M1.15 3H2.15Q3.9 3 3.9 4.75V14.9H1.15ZM20.1 3H21.1Q22.85 3 22.85 4.75V14.9H20.1Z" fill={color}/></G></G></Svg>;
};
const CutHammer = ({ size = 24, color = "currentColor", ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3 3H5L6.2 4.8H8L9.4 3H18C24.63 3 30 8.37 30 15H28.5C27.67 15 27 14.33 27 13.5C26.25 9.25 22.55 6 18 6H5V10H17C18.66 10 20 11.34 20 13V13.3H9.4L8 11.8H6.2L5 13.3H3L2 12.3V4Z" fill={color} fillRule="evenodd" /><Path d="M12 17.3C12 16.58 12.58 16 13.3 16H14.6V27.4H16C16.77 27.4 17.4 26.77 17.4 26V16H20V26C20 28.21 18.21 30 16 30H12Z" fill={color} fillRule="evenodd" /></Svg>
);

const CutShorts = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => {
  const clipId = React.useId().replace(/:/g, "");
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" {...props}>
      <Defs><ClipPath id={clipId}><Path d="M5 3H21Q27 3 27 9V29H11Q5 29 5 23Z" /></ClipPath></Defs>
      <G clipPath={`url(#${clipId})`}>
        <Path d="M10 3V29 M22 3V29 M10 16H22 M5 8H10 M22 8H27 M5 16H10 M22 16H27 M5 24H10 M22 24H27" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.05} strokeLinecap="butt" strokeLinejoin="miter" />
      </G>
      <Path d="M5 3H21Q27 3 27 9V29H11Q5 29 5 23Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round" />
    </Svg>
  );
};
export { CutShorts as Shorts, CutHammer as Hammer, CutHandshake as Handshake };

const CutSettingsCog = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M10.865 7.699Q11.100 7.513 11.379 7.403L13.483 6.569Q13.762 6.459 13.694 6.167L13.271 4.366Q12.986 3.149 14.236 3.149L19.014 3.149L19.014 3.149L18.306 6.167Q18.238 6.459 18.517 6.569L20.621 7.403Q20.900 7.513 21.135 7.699L22.909 9.105Q23.144 9.291 23.363 9.086L24.711 7.820Q25.622 6.964 26.247 8.047L28.637 12.185L28.637 12.185L25.669 13.081Q25.382 13.167 25.426 13.464L25.756 15.703Q25.800 16.000 25.756 16.297L25.426 18.536Q25.382 18.833 25.669 18.919L27.440 19.454Q28.637 19.815 28.012 20.898L25.622 25.036L25.622 25.036L23.363 22.914Q23.144 22.709 22.909 22.895L21.135 24.301Q20.900 24.487 20.621 24.597L18.517 25.431Q18.238 25.541 18.306 25.833L18.729 27.634Q19.014 28.851 17.764 28.851L12.986 28.851L12.986 28.851L13.694 25.833Q13.762 25.541 13.483 25.431L11.379 24.597Q11.100 24.487 10.865 24.301L9.091 22.895Q8.856 22.709 8.637 22.914L7.289 24.180Q6.378 25.036 5.753 23.953L3.363 19.815L3.363 19.815L6.331 18.919Q6.618 18.833 6.574 18.536L6.244 16.297Q6.200 16.000 6.244 15.703L6.574 13.464Q6.618 13.167 6.331 13.081L4.560 12.546Q3.363 12.185 3.988 11.102L6.378 6.964L6.378 6.964L8.637 9.086Q8.856 9.291 9.091 9.105Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.125} strokeLinejoin="miter"/><Path d="M20.4 16A4.4 4.4 0 1 1 11.6 16A4.4 4.4 0 1 1 20.4 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.125} strokeLinejoin="miter"/></Svg>
);
const CutCreator = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 6H16Q28 6 28 16Q28 22 22 22H20Q17 22 17 25Q17 28 13 28Q5 28 5 19Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M9.4 9.4H11Q12.6 9.4 12.6 11V12.6H11Q9.4 12.6 9.4 11Z" fill={color} fillRule="evenodd"/><Path d="M17.4 9.4H19Q20.6 9.4 20.6 11V12.6H19Q17.4 12.6 17.4 11Z" fill={color} fillRule="evenodd"/><Path d="M21.4 15.4H23Q24.6 15.4 24.6 17V18.6H23Q21.4 18.6 21.4 17Z" fill={color} fillRule="evenodd"/><Path d="M8.4 17.4H10Q11.6 17.4 11.6 19V20.6H10Q8.4 20.6 8.4 19Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutNewmembers = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M16 3L19.4 10.3Q19.8 11.2 20.8 11.3L28.8 12.3L23 18Q22.3 18.7 22.5 19.7L24 28L16.9 24Q16 23.5 15.1 24L8 28L9.5 19.7Q9.7 18.7 9 18L3.2 12.3L11.2 11.3Q12.2 11.2 12.6 10.3Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/></Svg>
);
const CutGrowing = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M9 4H13Q18 4 18 9Q18 14 13 14H9Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M3 28V19H13Q22 19 22 27V28H21Q19.6 28 19.6 26.6Q19.4 21.4 13 21.4H5.4V26.6Q5.4 28 4 28Z" fill={color} fillRule="evenodd"/><Path d="M24.2760 11.1000L31.0000 11.1000L31.0000 10.1760Q31.0000 8.9000 29.7240 8.9000L23.0000 8.9000L23.0000 9.8240Q23.0000 11.1000 24.2760 11.1000Z" fill={color} fillRule="evenodd"/><Path d="M25.9000 7.2760L25.9000 14.0000L26.8240 14.0000Q28.1000 14.0000 28.1000 12.7240L28.1000 6.0000L27.1760 6.0000Q25.9000 6.0000 25.9000 7.2760Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutChat = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M12 4H22Q28 4 28 10V19L23 16H20 M4 10H14Q20 10 20 16V28L14 24H10Q4 24 4 18Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M8 14H14Q16 14 16 16H10Q8 16 8 14Z M8 19H12Q14 19 14 21H10Q8 21 8 19Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutPrompt = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 22L21 6Q23 4 25 6L27 8L9 26Q7 28 5 26Z M18 9L23 14" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M6 3H8V6H11V8H8V11H6V8H3V6H6Z M24 21H26V24H29V26H26V29H24V26H21V24H24Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutSuperPowers = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M18 3L5 18H14L12 29L27 13H18Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/></Svg>
);
const CutUsernames = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M22 12V20Q28 20 28 14Q28 4 18 4H14Q4 4 4 14V19Q4 28 14 28H21 M22 12Q22 9 17 9H15Q10 9 10 15V17Q10 22 15 22Q22 22 22 16Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/></Svg>
);
const CutLiveTV = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 10H21Q28 10 28 17V27H11Q4 27 4 20Z M10 3L16 9L22 3" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M12 15L21 19L12 23Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutConverter = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M3.8000 22.3920L3.8000 28.2000L20.0000 28.2000L28.2000 28.2000L28.2000 21.0000L27.1920 21.0000Q25.8000 21.0000 25.8000 22.3920L25.8000 25.8000L20.0000 25.8000L6.2000 25.8000L6.2000 21.0000L5.1920 21.0000Q3.8000 21.0000 3.8000 22.3920Z" fill={color} fillRule="evenodd"/><Path d="M14.8000 5.3920L14.8000 21.0000L15.8080 21.0000Q17.2000 21.0000 17.2000 19.6080L17.2000 4.0000L16.1920 4.0000Q14.8000 4.0000 14.8000 5.3920Z" fill={color} fillRule="evenodd"/><Path d="M10.1358 16.8328L16.0000 22.6971L22.8485 15.8485L22.1358 15.1358Q21.1515 14.1515 20.1672 15.1358L16.0000 19.3029L10.8485 14.1515L10.1358 14.8642Q9.1515 15.8485 10.1358 16.8328Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutMigrate = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 13V5H11L14 9H22Q28 9 28 15V27H10Q4 27 4 21V20" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M2 15H13V12L20 18L13 24V21H5Q2 21 2 18Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutGlossary = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M7 5H20Q25 5 25 10V24H13Q7 24 7 18V9Q7 5 3 5Q1 5 1 9V11H7 M13 24V26Q13 29 17 29H25Q29 29 29 25V24Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M12 10H18Q20 10 20 12H14Q12 12 12 10Z M12 16H18Q20 16 20 18H14Q12 18 12 16Z" fill={color} fillRule="evenodd"/></Svg>
);

const CutBridge = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M6.2000 14.6080L6.2000 8.2000L26.0000 8.2000L26.0000 7.1920Q26.0000 5.8000 24.6080 5.8000L3.8000 5.8000L3.8000 16.0000L4.8080 16.0000Q6.2000 16.0000 6.2000 14.6080Z" fill={color} fillRule="evenodd"/><Path d="M21.1358 3.8328L24.3029 7.0000L20.1515 11.1515L20.8642 11.8642Q21.8485 12.8485 22.8328 11.8642L27.6971 7.0000L21.8485 1.1515L21.1358 1.8642Q20.1515 2.8485 21.1358 3.8328Z" fill={color} fillRule="evenodd"/><Path d="M25.8000 17.3920L25.8000 23.8000L6.0000 23.8000L6.0000 24.8080Q6.0000 26.2000 7.3920 26.2000L28.2000 26.2000L28.2000 16.0000L27.1920 16.0000Q25.8000 16.0000 25.8000 17.3920Z" fill={color} fillRule="evenodd"/><Path d="M9.1672 20.1358L4.3029 25.0000L10.1515 30.8485L10.8642 30.1358Q11.8485 29.1515 10.8642 28.1672L7.6971 25.0000L11.8485 20.8485L11.1358 20.1358Q10.1515 19.1515 9.1672 20.1358Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutRank = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M2.8000 5.3920L2.8000 29.2000L29.0000 29.2000L29.0000 28.1920Q29.0000 26.8000 27.6080 26.8000L5.2000 26.8000L5.2000 4.0000L4.1920 4.0000Q2.8000 4.0000 2.8000 5.3920Z" fill={color} fillRule="evenodd"/><Path d="M9 24V16H11Q14 16 14 19V24Z M18 24V7H20Q23 7 23 10V24Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutAgents = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 9H20Q27 9 27 16V26H12Q5 26 5 19Z M16 9V4H21 M5 15H2V21H5 M27 15H30V21H27" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M10 14H12Q14 14 14 16V18H12Q10 18 10 16Z M19 14H21Q23 14 23 16V18H21Q19 18 19 16Z M11 21H19Q21 21 21 23H13Q11 23 11 21Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutPremium = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 8L10 14L16 4L22 14L28 8V23H10Q4 23 4 17Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M5 27H23Q28 27 28 29H10Q5 29 5 27Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutPricing = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M4 5H15Q17 5 18.5 6.5L28 16L17 28L4 15Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M8 9H10Q12 9 12 11V13H10Q8 13 8 11Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutGettheapp = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M8 3H18Q24 3 24 9V29H14Q8 29 8 23Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M12 6H18Q20 6 20 8H14Q12 8 12 6Z M15 24H17Q19 24 19 26H17Q15 26 15 24Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutConnect = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M8 12H24V17Q24 24 16 24Q8 24 8 17Z M16 24V29" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M10 3H12Q14 3 14 5V12H12Q10 12 10 10Z M20 3H22Q24 3 24 5V12H22Q20 12 20 10Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutPacks = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M5 4H20Q28 4 28 12V28H13Q5 28 5 20Z M11 20Q16 26 22 20" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M10 10H12Q14 10 14 12V14H12Q10 14 10 12Z M20 10H22Q24 10 24 12V14H22Q20 14 20 12Z" fill={color} fillRule="evenodd"/></Svg>
);
const CutSignin = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><G transform="translate(32 0) scale(-1 1)"><Path d="M4 4H12Q17 4 17 9V28H4Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/><Path d="M13.3920 17.2000L28.0000 17.2000L28.0000 16.1920Q28.0000 14.8000 26.6080 14.8000L12.0000 14.8000L12.0000 15.8080Q12.0000 17.2000 13.3920 17.2000Z" fill={color} fillRule="evenodd"/><Path d="M23.1358 12.8328L26.3029 16.0000L22.1515 20.1515L22.8642 20.8642Q23.8485 21.8485 24.8328 20.8642L29.6971 16.0000L23.8485 10.1515L23.1358 10.8642Q22.1515 11.8485 23.1358 12.8328Z" fill={color} fillRule="evenodd"/></G></Svg>
);
const CutTopics = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M10 4H12Q14 4 14 6L11 28H9Q7 28 7 26Z M22 4H24Q26 4 26 6L23 28H21Q19 28 19 26Z M4 10H26Q28 10 28 12V14H6Q4 14 4 12Z M3 20H25Q27 20 27 22V24H5Q3 24 3 22Z" fill={color} fillRule="nonzero"/></Svg>
);
const CutTrending = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M17 3Q23 10 22 14L27 10Q30 16 27 23Q24 29 16 29Q7 29 5 22Q3 16 10 9L9 16Q16 12 17 3Z M17 17Q22 21 20 25Q18 28 14 26Q10 23 17 17Z" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/></Svg>
);
const CutWorld = ({ size = 24, color = "currentColor", strokeWidth = 2, ...props }: CutProps) => (
  <Svg width={size} height={size} viewBox="0 0 32 32" {...props}><Path d="M28 16A12 12 0 1 1 4 16A12 12 0 1 1 28 16Z M16 4Q6 16 16 28Q26 16 16 4Z M5 12H27 M5 20H27" fill="none" stroke={color} strokeWidth={Number(strokeWidth) * 1.2} strokeLinejoin="round"/></Svg>
);

export const cutIcons = {
  ArrowLeftRight: CutBridge,
  ListOrdered: CutRank,
  Bot: CutAgents,
  Crown: CutPremium,
  Tag: CutPricing,
  Smartphone: CutGettheapp,
  Plug: CutConnect,
  Smile: CutPacks,
  SmilePlus: CutPacks,
  LogIn: CutSignin,
  Hash: CutTopics,
  Flame: CutTrending,
  Globe: CutWorld,

  Film: CutShorts,
  Star: CutNewmembers,
  SquareUserRound: CutGrowing,
  MessagesSquare: CutChat,
  Wand: CutPrompt,
  Wand2: CutPrompt,
  Zap: CutSuperPowers,
  AtSign: CutUsernames,
  Tv: CutLiveTV,
  ArrowDownToLine: CutConverter,
  FolderInput: CutMigrate,
  Scroll: CutGlossary,

  Creator: CutCreator,
  SettingsCog: CutSettingsCog,
  MoreVertical: CutMoreVertical,
  EllipsisVertical: CutMoreVertical,
  PictureInPicture2: CutPictureInPicture,
  PictureInPicture: CutPictureInPicture,
  FastForward: CutFastForward,
  Rewind: CutRewind,
  Minimize: CutExitFullscreen,
  Handshake: CutHandshake,
  Hammer: CutHammer,
  Shorts: CutShorts,
  Home: CutHome,
  House: CutHome,
  Search: CutSearch,
  MessageEnvelope: CutMessageEnvelope,
  MessageSquare: CutMessages,
  MessageCircle: CutMessages,
  MessageSquareText: CutMessages,
  Bell: CutAlerts,
  User: CutProfile,
  UserRound: CutProfile,
  Bookmark: CutSave,
  ThumbsUp: CutLike,
  Repeat: CutRepost,
  Repeat2: CutRepost,
  Share: CutShare,
  Share2: CutFeedShare,
  Send: CutSend,
  Plus: CutAdd,
  X: CutClose,
  ArrowLeft: CutBack,
  ChevronRight: CutNext,
  Play: CutPlay,
  Pause: CutPause,
  Mic: CutMic,
  Settings: CutSettings,
  Settings2: CutSettings,
  SlidersHorizontal: CutSettings,
  Download: CutDownload,
  Menu: CutMenu,
  Gem: CutDiamond,
  Blog: CutBlog,
  Users: CutCommunities,
  UsersRound: CutCommunities,
  Gamepad2: CutArcade,
  Sparkles: CutAssistant,
  LayoutDashboard: CutCommand,
  Calendar: CutEvents,
  CalendarDays: CutEvents,
  Trophy: CutLeaderboard,
  Lightbulb: CutFeaturerequests,
  Blocks: CutApps,
  LayoutGrid: CutApps,
  Image: CutImages,
  Images: CutImages,
  Video: CutVideo,
  Music: CutMusic,
  Music2: CutMusic,
  Radio: CutLive,
  Camera: CutCamera,
  Upload: CutUpload,
  Paperclip: CutAttach,
  Pencil: CutEdit,
  PenLine: CutEdit,
  SquarePen: CutEdit,
  Wallet: CutWallet,
  Coins: CutCoins,
  Store: CutStore,
  ShieldCheck: CutSecurity,
  ThumbsDown: CutDislike,
  Reply: CutReply,
  Quote: CutQuote,
  Copy: CutCopy,
  Link: CutLink,
  Link2: CutLink,
  RefreshCw: CutRefresh,
  Filter: CutFilter,
  Funnel: CutFilter,
  ListFilter: CutSort,
  MoreHorizontal: CutMore,
  Ellipsis: CutMore,
  Trash: CutDelete,
  Trash2: CutDelete,
  Check: CutCheck,
  ExternalLink: CutOpenexternally,
  Volume2: CutVolume,
  VolumeX: CutMute,
  MicOff: CutMicoff,
  VideoOff: CutVideooff,
  Captions: CutCaptions,
  Fullscreen: CutFullscreen,
  Maximize: CutFullscreen,
  SkipBack: CutPrevious,
  SkipForward: CutNexttrack,
  Crop: CutCrop,
  Scissors: CutTrim,
  Undo: CutUndo,
  Undo2: CutUndo,
  Redo: CutRedo,
  Redo2: CutRedo,
  Lock: CutPrivacy,
  LockKeyhole: CutPrivacy,
  Eye: CutVisibility,
  EyeOff: CutHidden,
  UserPlus: CutAddaccount,
  SwitchAccounts: CutSwitchaccounts,
  LogOut: CutSignout,
  Languages: CutLanguage,
  Moon: CutAppearance,
  HelpCircle: CutHelp,
  CircleHelp: CutHelp,
  Info: CutInformation,
  Flag: CutReport,
  Ban: CutBlocked,
  BookOpen: CutDocs,
  Map: CutGuide,
  BarChart3: CutStats,
  ChartColumn: CutStats,
  ChartBarBig: CutStats,
  Megaphone: CutAdvertising,
  Briefcase: CutBounties,
  Vote: CutGovernance,
  Landmark: CutDAO,
  Vault: CutStaking,
  PieChart: CutFractions,
  ChartPie: CutFractions,
  Gift: CutGifts,
  MapPin: CutLocation,
  History: CutHistory,
  TimeAgo: CutClock,
};
export type CutIconName = keyof typeof cutIcons;
/** Expand filled artwork as well as strokes for a crisp half-pixel media outline. */
export function renderCutIconOutline(name: string, size: number, color: string) {
  if (!Object.prototype.hasOwnProperty.call(cutIcons, name)) return null;
  const artwork = cutIcons[name as CutIconName]({ size, color, strokeWidth: 3 });
  const expand = (children: React.ReactNode): React.ReactNode => React.Children.map(children, child => {
    if (!React.isValidElement<{ fill?: string; children?: React.ReactNode }>(child)) return child;
    if (child.type === Path && child.props.fill && child.props.fill !== "none") {
      return React.cloneElement(child as React.ReactElement<React.ComponentProps<typeof Path>>, {
        stroke: color, strokeWidth: 32 / size, strokeLinejoin: "round",
      });
    }
    if (child.type === G) return React.cloneElement(child, {}, expand(child.props.children));
    return child;
  });
  return React.cloneElement(artwork, {}, expand(artwork.props.children));
}
export function getCutIcon(name: string): React.ComponentType<CutProps> | undefined {
  return Object.prototype.hasOwnProperty.call(cutIcons, name) ? cutIcons[name as CutIconName] : undefined;
}
export { CutHome as Home, CutHome as House, CutSearch as Search, CutMessages as MessageSquare, CutMessages as MessageCircle, CutMessages as MessageSquareText, CutAlerts as Bell, CutProfile as User, CutProfile as UserRound, CutSave as Bookmark, CutLike as ThumbsUp, CutRepost as Repeat, CutRepost as Repeat2, CutShare as Share, CutFeedShare as Share2, CutSend as Send, CutAdd as Plus, CutClose as X, CutBack as ArrowLeft, CutNext as ChevronRight, CutPlay as Play, CutPause as Pause, CutMic as Mic, CutSettings as Settings, CutSettings as Settings2, CutSettings as SlidersHorizontal, CutDownload as Download, CutMenu as Menu, CutDiamond as Gem, CutBlog as Blog, CutCommunities as Users, CutCommunities as UsersRound, CutArcade as Gamepad2, CutAssistant as Sparkles, CutCommand as LayoutDashboard, CutEvents as Calendar, CutEvents as CalendarDays, CutLeaderboard as Trophy, CutFeaturerequests as Lightbulb, CutApps as Blocks, CutApps as LayoutGrid, CutImages as Image, CutImages as Images, CutVideo as Video, CutMusic as Music, CutMusic as Music2, CutLive as Radio, CutCamera as Camera, CutUpload as Upload, CutAttach as Paperclip, CutEdit as Pencil, CutEdit as PenLine, CutEdit as SquarePen, CutWallet as Wallet, CutCoins as Coins, CutStore as Store, CutSecurity as ShieldCheck, CutDislike as ThumbsDown, CutReply as Reply, CutQuote as Quote, CutCopy as Copy, CutLink as Link, CutLink as Link2, CutRefresh as RefreshCw, CutFilter as Filter, CutFilter as Funnel, CutSort as ListFilter, CutMore as MoreHorizontal, CutMore as Ellipsis, CutDelete as Trash, CutDelete as Trash2, CutCheck as Check, CutOpenexternally as ExternalLink, CutVolume as Volume2, CutMute as VolumeX, CutMicoff as MicOff, CutVideooff as VideoOff, CutCaptions as Captions, CutFullscreen as Fullscreen, CutFullscreen as Maximize, CutPrevious as SkipBack, CutNexttrack as SkipForward, CutCrop as Crop, CutTrim as Scissors, CutUndo as Undo, CutUndo as Undo2, CutRedo as Redo, CutRedo as Redo2, CutPrivacy as Lock, CutPrivacy as LockKeyhole, CutVisibility as Eye, CutHidden as EyeOff, CutAddaccount as UserPlus, CutSwitchaccounts as SwitchAccounts, CutSignout as LogOut, CutLanguage as Languages, CutAppearance as Moon, CutHelp as HelpCircle, CutHelp as CircleHelp, CutInformation as Info, CutReport as Flag, CutBlocked as Ban, CutDocs as BookOpen, CutGuide as Map, CutStats as BarChart3, CutStats as ChartColumn, CutStats as ChartBarBig, CutAdvertising as Megaphone, CutBounties as Briefcase, CutGovernance as Vote, CutDAO as Landmark, CutStaking as Vault, CutFractions as PieChart, CutFractions as ChartPie, CutGifts as Gift, CutLocation as MapPin, CutHistory as History };

export { CutMoreVertical as MoreVertical, CutMoreVertical as EllipsisVertical, CutPictureInPicture as PictureInPicture2, CutPictureInPicture as PictureInPicture, CutFastForward as FastForward, CutRewind as Rewind, CutExitFullscreen as Minimize };

export { CutSettingsCog as SettingsCog };

export { CutCreator as Creator };
export { CutShorts as Film };
export { CutNewmembers as Star };
export { CutGrowing as SquareUserRound };
export { CutChat as MessagesSquare };
export { CutMessageEnvelope as MessageEnvelope };
export { CutPrompt as Wand };
export { CutPrompt as Wand2 };
export { CutSuperPowers as Zap };
export { CutUsernames as AtSign };
export { CutLiveTV as Tv };
export { CutConverter as ArrowDownToLine };
export { CutMigrate as FolderInput };
export { CutGlossary as Scroll };
export { CutBridge as ArrowLeftRight };
export { CutRank as ListOrdered };
export { CutAgents as Bot };
export { CutPremium as Crown };
export { CutPricing as Tag };
export { CutGettheapp as Smartphone };
export { CutConnect as Plug };
export { CutPacks as Smile };
export { CutPacks as SmilePlus };
export { CutSignin as LogIn };
export { CutTopics as Hash };
export { CutTrending as Flame };
export { CutWorld as Globe };
