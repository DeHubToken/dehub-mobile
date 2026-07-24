import React, { useState, useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { toastError } from "../../libs/toast";

interface PhoneLoginFlowProps {
  onSubmit: (provider: string, phone?: string) => void;
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
  const [isValidating, setIsValidating] = useState(false);
  const inputRef = useRef<TextInput>(null);

  // Focus input when it appears
  useEffect(() => {
    if (showInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showInput]);

  const isValidPhone = (phoneNumber: string) => {
    // Basic validation: starts with + and has at least 10 digits
    const cleaned = phoneNumber.replace(/\s/g, "");
    return cleaned.startsWith("+") && cleaned.length >= 11;
  };

  const validateAndSubmit = async () => {
    if (!isValidPhone(phone)) {
      toastError("Please enter a valid phone number with country code (e.g., +1234567890)");
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch(
        "https://api.web3auth.io/passwordless-service/api/v3/phone_number/validate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            phone_number: phone.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        toastError("Invalid phone number. Please check and try again.");
        return;
      }

      // Use the parsed_number from the API response as the login hint
      onSubmit("sms_passwordless", data.parsed_number);
    } catch (error) {
      console.error("[PhoneLoginFlow] Validation error:", error);
      toastError("Failed to validate phone number. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  if (!showInput) {
    return (
      <TouchableOpacity
        className="flex-row items-center justify-center rounded-2xl bg-neutral-800 border border-neutral-700"
        style={{ width: "100%", height: 60 }}
        onPress={() => setShowInput(true)}
        disabled={disabled}
        accessibilityLabel="Continue with Phone"
      >
        <Ionicons name="call" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
        {!!loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-xl font-medium text-white">
            Continue with Phone
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
        name="call"
        size={20}
        color="#FFFFFF"
        style={{ marginRight: 10 }}
      />
      <TextInput
        ref={inputRef}
        className="flex-1 text-xl text-white"
        placeholder="+(00)123456"
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
        onPress={validateAndSubmit}
        disabled={loading || disabled || isValidating || !isValidPhone(phone)}
        className="ml-2"
        accessibilityLabel="Submit phone for login"
      >
        {isValidating ? (
          <ActivityIndicator color="#A0AEC0" size="small" />
        ) : (
          <Text
            className="text-theme-accent font-medium text-base"
            style={{
              opacity: loading || disabled || !isValidPhone(phone) ? 0.5 : 1,
            }}
          >
            {loading ? "..." : "Submit"}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default PhoneLoginFlow;
