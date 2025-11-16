import React from "react";
import { View, Text } from "react-native";

export type StreamStatus = "OFFLINE" | "LIVE" | "ENDED" | "SCHEDULED" | string;

interface BadgeProps {
  status?: StreamStatus | null;
  className?: string; // Tailwind classes (NativeWind)
}

// Maps status to tailwind background + text label
const STATUS_STYLES: Record<string, { container: string; label: string }> = {
  OFFLINE: { container: "bg-gray-500", label: "OFFLINE" },
  LIVE: { container: "bg-red-600", label: "LIVE" },
  ENDED: { container: "bg-gray-600", label: "ENDED" },
  SCHEDULED: { container: "bg-yellow-500", label: "SCHEDULED" },
};

const StatusBadge: React.FC<BadgeProps> = ({ status, className }) => {
  if (!status) return null;
  const key = (status || "").toUpperCase();
  const style = STATUS_STYLES[key] || null;
  if (!style) return null; // unsupported status -> no badge
  return (
    <View
      className={`absolute left-2 top-2 rounded-full px-2 py-0.5 ${
        style.container
      } ${className || ""}`}
    >
      <Text className="text-white text-[10px] font-semibold uppercase tracking-wide">
        {style.label}
      </Text>
    </View>
  );
};

export default StatusBadge;
