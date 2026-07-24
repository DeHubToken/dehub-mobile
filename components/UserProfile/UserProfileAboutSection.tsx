import React, { memo, useCallback, useState } from "react";
import { View } from "react-native";
import DescriptionBlock from "../VideoPlayer/DescriptionBlock";

interface UserProfileAboutSectionProps {
  content: string;
}

const UserProfileAboutSection: React.FC<UserProfileAboutSectionProps> = memo(
  ({ content }) => {
    const [open, setOpen] = useState(false);
    const handleToggle = useCallback(() => setOpen((o) => !o), []);

    return (
      <View className="mt-2">
        <DescriptionBlock
          title="About"
          description={content}
          showDesc={open}
          onToggle={handleToggle}
        />
      </View>
    );
  }
);

UserProfileAboutSection.displayName = "UserProfileAboutSection";

export default UserProfileAboutSection;
