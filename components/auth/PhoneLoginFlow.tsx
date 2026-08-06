import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Mirrors dehubweb's LoginModal phone validation — E.164 format
// ("+" country code, 7-15 digits total).
const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

interface PhoneLoginFlowProps {
  onSubmit: (phone: string) => void;
  loading?: boolean;
  disabled?: boolean;
}

const PhoneLoginFlow: React.FC<PhoneLoginFlowProps> = ({
  onSubmit,
  loading,
  disabled,
}) => {
  const [showInput, setShowInput] = useState(false);
  const [phone, setPhone] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const isValid = E164_PHONE_REGEX.test(phone.trim());

  if (!showInput) {
    return (
      <TouchableOpacity
        className={`flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700 ${
          disabled ? "opacity-50" : ""
        }`}
        style={{ width: "100%", height: 60 }}
        onPress={() => setShowInput(true)}
        disabled={disabled}
        accessibilityLabel="Continue with Phone"
      >
        <Ionicons name="call" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
        {!!loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-medium text-white">
            Continue with Phone
          </Text>
        )}
      </TouchableOpacity>
    );
  }
  return (
    <View
      className="flex-row items-center border border-neutral-700 rounded-2xl bg-neutral-800 px-4"
      style={{ width: "100%", height: 60 }}
    >
      <Ionicons
        name="call"
        size={20}
        color="#FFFFFF"
        style={{ marginRight: 10 }}
      />
      <TextInput
        ref={inputRef}
        className="flex-1 text-xl text-white"
        placeholder="+1 415 555 2671"
        placeholderTextColor="#6B7280"
        value={phone}
        onChangeText={setPhone}
        editable={!loading && !disabled}
        keyboardType="phone-pad"
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
          if (isValid) onSubmit(phone.trim());
        }}
        disabled={loading || disabled || !isValid}
        className="ml-2 py-3 px-2"
        accessibilityLabel="Submit phone number for login"
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text
            className="text-theme-accent font-medium text-base"
            style={{ opacity: loading || disabled || !isValid ? 0.5 : 1 }}
          >
            Submit
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default PhoneLoginFlow;
