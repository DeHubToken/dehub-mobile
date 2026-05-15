import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import PlanCard from "../Subscription/PlanCard";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import Icon from "../ui/Icon";
import { getPlans, type SubscriptionPlan } from "../../services/subscription.service";

interface SubscribersRouteProps {
  address?: string;
  isOwnProfile?: boolean;
}

const SubscribersRoute: React.FC<SubscribersRouteProps> = ({ address, isOwnProfile }) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getPlans(address);
      setPlans(result);
    } catch (e: any) {
      setError(e?.message || "Failed to load plans");
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  const renderItem = useCallback(
    ({ item }: { item: SubscriptionPlan }) => (
      <PlanCard plan={item} isOwner={isOwnProfile} />
    ),
    [isOwnProfile],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
        <Text style={{ color: "#a1a1aa", marginBottom: 8 }}>{error}</Text>
      </View>
    );
  }

  if (plans.length === 0) {
    if (isOwnProfile) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24 }}>
          <Icon name="Star" size={48} color="#52525b" />
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", marginTop: 12 }}>
            Subscriber Content
          </Text>
          <Text style={{ color: "#71717a", fontSize: 13, marginTop: 4, textAlign: "center" }}>
            Create subscription plans to offer exclusive content to your subscribers
          </Text>
          <View style={{ marginTop: 16 }}>
            <AccentButtonGradient>
              <TouchableOpacity activeOpacity={0.7} style={{ paddingHorizontal: 24, paddingVertical: 10 }}>
                <Text style={{ color: "#000", fontSize: 14, fontWeight: "700" }}>Create Your First Plan</Text>
              </TouchableOpacity>
            </AccentButtonGradient>
          </View>
        </View>
      );
    }

    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
        <Icon name="Star" size={48} color="#52525b" />
        <Text style={{ color: "#a1a1aa", fontSize: 15, fontWeight: "600", marginTop: 12 }}>
          No subscription plans
        </Text>
        <Text style={{ color: "#71717a", fontSize: 13, marginTop: 4 }}>
          This creator hasn't set up any plans yet
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={plans}
      keyExtractor={(item) => String(item._id || item.id || Math.random())}
      renderItem={renderItem}
      contentContainerStyle={{ padding: 12 }}
      showsVerticalScrollIndicator={false}
    />
  );
};

export default SubscribersRoute;
