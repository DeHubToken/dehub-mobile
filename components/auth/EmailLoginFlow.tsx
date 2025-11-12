import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface EmailLoginFlowProps {
  onSubmit: (provider: string, email?: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

const EmailLoginFlow: React.FC<EmailLoginFlowProps> = ({
  onSubmit,
  loading,
  disabled,
}) => {
  const [showInput, setShowInput] = useState(false);
  const [email, setEmail] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  if (!showInput) {
    return (
      <TouchableOpacity
        className="flex-row items-center justify-center h-11 rounded-lg border border-gray-600 bg-transparent mt-2 mb-2 w-[90%] max-w-md"
        onPress={() => setShowInput(true)}
        disabled={disabled}
        accessibilityLabel="Continue with Email"
      >
        {!!loading && (
          <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
        )}
        <View className="flex-1 items-center">
          <Text className="text-base font-medium text-theme-neutrals-100">
            Continue with Email
          </Text>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <View
      className="flex-row items-center border border-theme-accent rounded-lg bg-transparent mt-2 mb-2 w-[90%] max-w-md px-3 h-11"
      style={{ minHeight: 44 }}
    >
      <Ionicons
        name="mail-outline"
        size={22}
        color="#A0AEC0"
        style={{ marginLeft: 4, marginRight: 8 }}
      />
      <TextInput
        ref={inputRef}
        className="flex-1 text-base text-theme-neutrals-100"
        placeholder="user@example.com"
        placeholderTextColor="#A0AEC0"
        value={email}
        onChangeText={setEmail}
        editable={!loading && !disabled}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          paddingVertical: 0,
          minHeight: 40,
          color: "#fff",
          backgroundColor: "transparent",
        }}

      />
      <TouchableOpacity
        onPress={() => {
          if (email && email.includes("@")) {
            onSubmit("email_passwordless", email);
          }
        }}
        disabled={loading || disabled || !email || !email.includes("@")}
        className="ml-2"
        accessibilityLabel="Submit email for login"
      >
        <Text
          className="text-theme-accent font-medium"
          style={{
            opacity:
              loading || disabled || !email || !email.includes("@") ? 0.5 : 1,
          }}
        >
          {loading ? "..." : "Submit"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default EmailLoginFlow;
