import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmailCodeEntryProps {
  email: string;
  onSubmit: (code: string) => void;
  onBack: () => void;
  onResend: () => void;
  loading?: boolean;
  disabled?: boolean;
}

const EmailCodeEntry: React.FC<EmailCodeEntryProps> = ({
  email,
  onSubmit,
  onBack,
  onResend,
  loading,
  disabled,
}) => {
  const [code, setCode] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSubmit = code.trim().length >= 6 && !loading && !disabled;

  return (
    <View className="w-full">
      <Text className="text-gray-400 text-sm mb-3 text-center">
        Enter the code sent to{"\n"}
        <Text className="text-white">{email}</Text>
      </Text>
      <View
        className="flex-row items-center border border-neutral-700 rounded-2xl bg-neutral-800 px-4"
        style={{ width: "100%", height: 62 }}
      >
        <Ionicons name="key" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
        <TextInput
          ref={inputRef}
          className="flex-1 text-xl text-white"
          placeholder="6-digit code"
          placeholderTextColor="#6B7280"
          value={code}
          onChangeText={setCode}
          editable={!loading && !disabled}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          style={{
            paddingVertical: 0,
            color: "#fff",
            backgroundColor: "transparent",
          }}
        />
        <TouchableOpacity
          onPress={() => canSubmit && onSubmit(code.trim())}
          disabled={!canSubmit}
          className="ml-2"
          accessibilityLabel="Verify code"
        >
          <Text
            className="text-theme-accent font-medium text-base"
            style={{ opacity: canSubmit ? 1 : 0.5 }}
          >
            {loading ? "..." : "Verify"}
          </Text>
        </TouchableOpacity>
      </View>

      <View className="flex-row justify-between mt-3">
        <TouchableOpacity onPress={onBack} disabled={loading} accessibilityLabel="Back">
          <Text className="text-gray-400 text-sm">Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onResend} disabled={loading} accessibilityLabel="Resend code">
          <Text className="text-theme-accent text-sm">Resend code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default EmailCodeEntry;
