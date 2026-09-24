import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, FlatList, ActivityIndicator, TouchableOpacity } from "react-native";
import PlanCard from "../Subscription/PlanCard";
import PlanFormSheet from "../Subscription/PlanFormSheet";
import AccentButtonGradient from "../ui/AccentButtonGradient";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import { getPlans, type SubscriptionPlan } from "../../services/subscription.service";
import ProfileEmptyState from "./ProfileEmptyState";

interface SubscribersRouteProps {
  address?: string;
  isOwnProfile?: boolean;
  listHeader?: React.ReactElement | null;
}

const SubscribersRoute: React.FC<SubscribersRouteProps> = ({ address, isOwnProfile, listHeader }) => {
  const { t } = useTranslation();
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
      setError(e?.message || t("subscriptions.loadPlansFailed"));
    } finally {
      setLoading(false);
    }
  }, [address, t]);

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
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24, gap: 12 }}>
          <Icon name="CircleAlert" size={40} color="#808089" />
          <Text style={{ color: "#A6A9AC", fontSize: 14, textAlign: "center" }}>{error}</Text>
          <TouchableOpacity
            onPress={fetchPlans}
            activeOpacity={0.7}
            style={{ backgroundColor: "rgba(255,255,255,0.10)", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "600" }}>{t("common.retry")}</Text>
          </TouchableOpacity>
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          isOwnProfile ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 24 }}>
              <ProfileEmptyState
                kind="subscribers"
                title={t("subscriptions.subscriberContent")}
                subtitle={t("subscriptions.subscriberContentSub")}
              />
              <View>
                <AccentButtonGradient>
                  <TouchableOpacity
                    onPress={handleCreatePress}
                    activeOpacity={0.7}
                    style={{ paddingHorizontal: 24, paddingVertical: 10 }}
                  >
                    <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>{t("subscriptions.createFirstPlan")}</Text>
                  </TouchableOpacity>
                </AccentButtonGradient>
              </View>
            </View>
          ) : (
            <ProfileEmptyState
              kind="subscribers"
              title={t("profile.noPlans")}
              subtitle={t("profile.noPlansSub")}
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
                <Text className="text-white font-semibold text-sm">{t("subscriptions.addNewPlan")}</Text>
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
