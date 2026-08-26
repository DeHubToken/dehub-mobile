/**
 * Shared settings row primitives — the mobile counterparts of web's
 * `SettingToggle` and `SettingDrawerSelect` (dehubweb
 * src/pages/app/SettingsPage.tsx, src/components/app/settings/).
 *
 * Every settings panel builds from these so the two clients stay structurally
 * identical: icon + title + description on the left, control on the right,
 * grouped under an uppercase section label inside a bordered card.
 *
 * `comingSoon` matches web exactly — the control is inert and tapping it
 * toasts instead of writing anything.
 */
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon, { type IconName } from '../ui/Icon';
import CustomSwitch from '../ui/CustomSwitch';
import GlassModal from '../ui/GlassModal';
import { SettingsAnchor } from './SettingsAnchor';
import { toastInfo } from '../../libs';

export const SectionLabel: React.FC<{ label: string; icon?: IconName }> = ({ label, icon }) => (
  <View className="flex-row items-center mb-2 ml-1">
    {icon ? <Icon name={icon} size={13} color="#A6A9AC" /> : null}
    <Text
      className={`text-theme-neutrals-500 text-[11px] uppercase tracking-widest font-semibold ${icon ? 'ml-1.5' : ''}`}
    >
      {label}
    </Text>
  </View>
);

export const SectionCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden border border-theme-neutrals-700">
    {children}
  </View>
);

export const Divider = () => <View className="h-px bg-theme-neutrals-700 ml-16" />;

/**
 * Section wrapper: label + card, with the spacing web uses between blocks.
 *
 * `anchor` opts the section into settings search — it becomes the thing a
 * search hit scrolls to and flashes. It has to wrap the outermost view: the
 * anchor reports its `y` with onLayout, which is only in scroll coordinates
 * while it is a direct child of the panel's ScrollView.
 */
export const SettingsSection: React.FC<{
  label: string;
  icon?: IconName;
  note?: string;
  children: React.ReactNode;
  className?: string;
  anchor?: string;
}> = ({ label, icon, note, children, className, anchor }) => {
  const body = (
    <View className={`mt-6 mx-4 ${className ?? ''}`}>
      <SectionLabel label={label} icon={icon} />
      <SectionCard>{children}</SectionCard>
      {note ? (
        <Text className="text-theme-neutrals-500 text-xs mt-2 mx-1">{note}</Text>
      ) : null}
    </View>
  );
  return anchor ? <SettingsAnchor id={anchor}>{body}</SettingsAnchor> : body;
};

type BaseRowProps = {
  icon: IconName;
  iconColor?: string;
  label: string;
  description?: string;
  disabled?: boolean;
  destructive?: boolean;
};

const RowShell: React.FC<BaseRowProps & { right?: React.ReactNode }> = ({
  icon,
  iconColor = '#A6A9AC',
  label,
  description,
  disabled,
  destructive,
  right,
}) => (
  <View className={`px-4 py-3.5 flex-row items-center ${disabled ? 'opacity-40' : ''}`}>
    <View className="mr-3 w-9 h-9 rounded-xl bg-theme-neutrals-700/50 items-center justify-center">
      <Icon name={icon} size={18} color={destructive ? '#ef4444' : iconColor} />
    </View>
    <View className="flex-1 mr-2">
      <Text className={`text-sm font-medium ${destructive ? 'text-red-400' : 'text-white'}`}>
        {label}
      </Text>
      {description ? (
        <Text className="text-theme-neutrals-500 text-xs mt-0.5">{description}</Text>
      ) : null}
    </View>
    {right}
  </View>
);

/** Tappable row that opens something else (modal, screen, external link). */
export const SettingsLinkRow: React.FC<
  BaseRowProps & { onPress: () => void; value?: string; external?: boolean }
> = ({ onPress, value, external, ...rest }) => (
  <TouchableOpacity onPress={onPress} disabled={rest.disabled} activeOpacity={0.7}>
    <RowShell
      {...rest}
      right={
        <View className="flex-row items-center">
          {value ? (
            <Text className="text-theme-neutrals-400 text-xs mr-2">{value}</Text>
          ) : null}
          <Icon
            name={external ? 'ExternalLink' : 'ChevronRight'}
            size={18}
            color={rest.destructive ? '#ef4444' : '#8B8D90'}
          />
        </View>
      }
    />
  </TouchableOpacity>
);

/** Static row that only displays state (badges, counts). */
export const SettingsInfoRow: React.FC<BaseRowProps & { right?: React.ReactNode }> = (props) => (
  <RowShell {...props} />
);

/**
 * Switch row. `comingSoon` mirrors web: the switch renders in its default
 * position and toasting replaces any write.
 */
export const SettingsToggleRow: React.FC<
  BaseRowProps & {
    value: boolean;
    onValueChange?: (v: boolean) => void;
    comingSoon?: boolean;
  }
> = ({ value, onValueChange, comingSoon, ...rest }) => {
  const { t } = useTranslation();
  return (
    <RowShell
      {...rest}
      disabled={rest.disabled || comingSoon}
      right={
        <CustomSwitch
          value={value}
          onValueChange={
            comingSoon ? () => toastInfo(t('settings.comingSoon')) : onValueChange ?? (() => {})
          }
          disabled={rest.disabled}
        />
      }
    />
  );
};

export type SettingOption = {
  value: string;
  label: string;
  description?: string;
};

/**
 * Bottom-sheet option picker — the mobile shape of web's
 * `SettingDrawerSelect`. Same contract: current value, options with optional
 * descriptions, a check on the selected one.
 */
export const SettingsOptionModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string;
  options: SettingOption[];
  onSelect: (value: string) => void;
  maxHeight?: string;
}> = ({ visible, onClose, title, value, options, onSelect, maxHeight = '50%' }) => (
  <GlassModal
    visible={visible}
    onClose={onClose}
    presentation="bottom"
    maxHeight={maxHeight}
    blurIntensity={30}
  >
    <View className="pb-4 pt-2">
      <Text className="text-theme-neutrals-400 text-xs text-center py-3 font-semibold uppercase tracking-widest">
        {title}
      </Text>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          onPress={() => {
            onSelect(opt.value);
            onClose();
          }}
          activeOpacity={0.7}
          className="flex-row items-center px-5 py-3.5"
        >
          <View className="flex-1">
            <Text className="text-white text-[15px] font-medium">{opt.label}</Text>
            {opt.description ? (
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">{opt.description}</Text>
            ) : null}
          </View>
          {value === opt.value ? <Icon name="Check" size={18} color="#D4D4D8" /> : null}
        </TouchableOpacity>
      ))}
    </View>
  </GlassModal>
);

/** Grey explainer block web renders under several sections. */
export const SettingsNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <View className="mt-6 mx-4 p-4 bg-theme-neutrals-800/50 rounded-xl flex-row items-start">
    <Icon name="Info" size={16} color="#8B8D90" />
    <Text className="text-theme-neutrals-500 text-xs ml-2 flex-1">{children}</Text>
  </View>
);
