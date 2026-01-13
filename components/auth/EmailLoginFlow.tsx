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
        className="flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700"
        style={{ width: "100%", height: 60 }}
        onPress={() => setShowInput(true)}
        disabled={disabled}
        accessibilityLabel="Continue with Email"
      >
        <Ionicons name="mail" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
        {!!loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-xl font-medium text-white">
            Continue with Email
          </Text>
        )}
      </TouchableOpacity>
    );
  }
  return (
    <View
      className="flex-row items-center border border-neutral-700 rounded-2xl bg-neutral-800 px-4"
      style={{ width: "100%", height: 62 }}
    >
      <Ionicons
        name="mail"
        size={20}
        color="#FFFFFF"
        style={{ marginRight: 10 }}
      />
      <TextInput
        ref={inputRef}
        className="flex-1 text-xl text-white"
        placeholder="user@example.com"
        placeholderTextColor="#6B7280"
        value={email}
        onChangeText={setEmail}
        editable={!loading && !disabled}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          paddingVertical: 0,
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
          className="text-theme-accent font-medium text-base"
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
