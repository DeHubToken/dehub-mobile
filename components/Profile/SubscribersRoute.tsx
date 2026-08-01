import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import PlanCard from "../Subscription/PlanCard";
import PlanFormSheet from "../Subscription/PlanFormSheet";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import Icon from "../ui/Icon";
import { getPlans, type SubscriptionPlan } from "../../services/subscription.service";
import ProfileEmptyState from "./ProfileEmptyState";

interface SubscribersRouteProps {
  address?: string;
  isOwnProfile?: boolean;
  listHeader?: React.ReactElement | null;
}

const SubscribersRoute: React.FC<SubscribersRouteProps> = ({ address, isOwnProfile, listHeader }) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);

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

  const handlePlanSuccess = useCallback((plan: SubscriptionPlan) => {
    setPlans(prev => {
      const exists = prev.findIndex(p => (p._id || p.id) === (plan._id || plan.id));
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = plan;
        return next;
      }
      return [plan, ...prev];
    });
  }, []);

  const handleEditPress = useCallback((plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setShowForm(true);
  }, []);

  const handleCreatePress = useCallback(() => {
    setEditingPlan(null);
    setShowForm(true);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: SubscriptionPlan }) => (
      <PlanCard
        plan={item}
        isOwner={isOwnProfile}
        onEdit={isOwnProfile ? () => handleEditPress(item) : undefined}
      />
    ),
    [isOwnProfile, handleEditPress],
  );

  if (loading) {
    return (
      <ScrollView>
        {listHeader}
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
          <ActivityIndicator color="#fff" />
        </View>
      </ScrollView>
    );
  }

  if (error) {
    return (
      <ScrollView>
        {listHeader}
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
          <Text style={{ color: "#a1a1aa", marginBottom: 8 }}>{error}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <>
      <FlatList
        data={plans}
        keyExtractor={(item) => String(item._id || item.id || Math.random())}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isOwnProfile ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24 }}>
              <ProfileEmptyState
                kind="subscribers"
                title="Subscriber content"
                subtitle="Create plans to offer exclusive content to subscribers"
              />
              <View style={{ marginTop: -20 }}>
                <AccentButtonGradient>
                  <TouchableOpacity
                    onPress={handleCreatePress}
                    activeOpacity={0.7}
                    style={{ paddingHorizontal: 24, paddingVertical: 10 }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>Create Your First Plan</Text>
                  </TouchableOpacity>
                </AccentButtonGradient>
              </View>
            </View>
          ) : (
            <ProfileEmptyState
              kind="subscribers"
              title="No subscription plans"
              subtitle="This creator hasn't set up any plans yet"
            />
          )
        }
        ListHeaderComponent={
          <>
            {listHeader}
            {isOwnProfile && plans.length > 0 ? (
              <TouchableOpacity
                onPress={handleCreatePress}
                activeOpacity={0.7}
                className="flex-row items-center justify-center gap-2 bg-white/10 border border-white/20 rounded-xl py-3 mb-3"
              >
                <Icon name="Plus" size={16} color="#FFFFFF" />
                <Text className="text-white font-semibold text-sm">Add New Plan</Text>
              </TouchableOpacity>
            ) : null}
          </>
        }
      />

      <PlanFormSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        onSuccess={handlePlanSuccess}
        editPlan={editingPlan}
      />
    </>
  );
};

export default SubscribersRoute;
