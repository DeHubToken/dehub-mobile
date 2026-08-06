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
        className={`flex-row items-center justify-center rounded-xl bg-white/10 border border-white/20 ${
          disabled ? "opacity-50" : ""
        }`}
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
      className="flex-row items-center border border-white/20 rounded-xl bg-white/10 px-4"
      style={{ width: "100%", height: 60 }}
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
        placeholderTextColor="#8B8D90"
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
        className="ml-2 py-3 px-2"
        accessibilityLabel="Submit email for login"
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text
            className="text-theme-accent font-medium text-base"
            style={{
              opacity:
                loading || disabled || !email || !email.includes("@") ? 0.5 : 1,
            }}
          >
            Submit
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default EmailLoginFlow;
