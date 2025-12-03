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
        className="flex-row items-center justify-center h-11 rounded-lg border border-gray-600 bg-transparent mt-2 mb-2 w-[90%] max-w-md"
        onPress={() => setShowInput(true)}
        disabled={disabled}
        accessibilityLabel="Continue with Phone"
      >
        {!!loading && (
          <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
        )}
        <View className="flex-1 items-center">
          <Text className="text-base font-medium text-theme-neutrals-100">
            Continue with Phone
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
        name="call-outline"
        size={22}
        color="#A0AEC0"
        style={{ marginLeft: 4, marginRight: 8 }}
      />
      <TextInput
        ref={inputRef}
        className="flex-1 text-base text-theme-neutrals-100"
        placeholder="+(00)123456"
        placeholderTextColor="#A0AEC0"
        value={phone}
        onChangeText={setPhone}
        editable={!loading && !disabled}
        keyboardType="phone-pad"
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
        onPress={validateAndSubmit}
        disabled={loading || disabled || isValidating || !isValidPhone(phone)}
        className="ml-2"
        accessibilityLabel="Submit phone for login"
      >
        {isValidating ? (
          <ActivityIndicator color="#A0AEC0" size="small" />
        ) : (
          <Text
            className="text-theme-accent font-medium"
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
