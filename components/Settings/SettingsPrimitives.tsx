/**
 * Shared settings row primitives — the mobile counterparts of web's
 * `SettingToggle` and `SettingDrawerSelect` (dehubweb
 * src/pages/app/SettingsPage.tsx, src/components/app/settings/).
 *
 * Every settings panel builds from these so the two clients stay identical:
 * web's `SettingsRow` grid (bare 20px icon, 16px title, 14px description,
 * control centred on the right), rows 16px apart under a plain grey heading,
 * all inside the one page bento that SettingsScrollView draws. No card per
 * group and no icon chips — web has neither.
 *
 * `comingSoon` matches web exactly — the control is inert and tapping it
 * toasts instead of writing anything.
 */
import React, { useContext } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon, { type IconName } from '../ui/Icon';
import CustomSwitch from '../ui/CustomSwitch';
import GlassModal from '../ui/GlassModal';
import { InSettingsBento, SettingsAnchor } from './SettingsAnchor';
import { toastInfo } from '../../libs';
import { useAppTheme } from '../../context/ThemeContext';
import { MINIMAL_HAIRLINE } from '../../theme/colors';

/**
 * Web's section heading (`font-medium text-zinc-400 text-sm`). `icon` is
 * accepted so callers need not change, but web's headings carry none.
 */
export const SectionLabel: React.FC<{ label: string; icon?: IconName }> = ({ label, icon }) => {
  const { colors } = useAppTheme();
  const inBento = useContext(InSettingsBento);
  if (inBento) {
    return <Text className="text-theme-neutrals-400 text-sm font-medium mb-2">{label}</Text>;
  }
  return (
    <View className="flex-row items-center mb-2 ml-1">
      {icon ? <Icon name={icon} size={13} color={colors.neutrals[400]} /> : null}
      <Text
        className={`text-theme-neutrals-500 text-[11px] uppercase tracking-widest font-semibold ${icon ? 'ml-1.5' : ''}`}
      >
        {label}
      </Text>
    </View>
  );
};

/**
 * A group of rows. Web has no box here — the rows sit straight on the page
 * bento. Rows keep their own 16px side padding (they are also tap targets),
 * so the group bleeds 16px each side to put their content flush with the
 * heading above.
 */
export const SectionCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isMinimal } = useAppTheme();
  const inBento = useContext(InSettingsBento);
  if (inBento) return <View className="-mx-4">{children}</View>;
  if (isMinimal) {
    return (
      <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: MINIMAL_HAIRLINE }}>
        {children}
      </View>
    );
  }
  return (
    <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden border border-theme-neutrals-700">
      {children}
    </View>
  );
};

/** In a bento rows are spaced by their own padding, as web's `space-y-4`; no rule between them. */
export const Divider = () => {
  const inBento = useContext(InSettingsBento);
  return inBento ? null : <View className="h-px bg-theme-neutrals-700 ml-12" />;
};

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
  const inBento = useContext(InSettingsBento);
  const body = (
    <View className={`mt-6 ${inBento ? '' : 'mx-4'} ${className ?? ''}`}>
      <SectionLabel label={label} icon={icon} />
      <SectionCard>{children}</SectionCard>
      {note ? (
        <Text className="text-theme-neutrals-500 text-sm mt-2">{note}</Text>
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
}) => {
  const { colors } = useAppTheme();
  const inBento = useContext(InSettingsBento);
  const resolvedIconColor = iconColor === '#A6A9AC' ? colors.neutrals[500] : iconColor;
  // Web's grid: icon on the title's line, text column, control centred.
  return (
    <View className={`px-4 ${inBento ? 'py-2' : 'py-3.5'} flex-row items-start ${disabled ? 'opacity-40' : ''}`}>
      <View className="mr-3 w-5 h-5 items-center justify-center">
        <Icon name={icon} size={20} color={destructive ? colors.foreground : resolvedIconColor} />
      </View>
      <View className="flex-1 mr-2">
        <Text className={`text-base leading-5 font-medium ${destructive ? 'text-white/80' : 'text-white'}`}>
          {label}
        </Text>
        {description ? (
          <Text className="text-theme-neutrals-500 text-sm leading-5 mt-0.5">{description}</Text>
        ) : null}
      </View>
      {right ? <View className="ml-2 self-center">{right}</View> : null}
    </View>
  );
};

/** Tappable row that opens something else (modal, screen, external link). */
export const SettingsLinkRow: React.FC<
  BaseRowProps & {
    onPress: () => void;
    value?: string;
    external?: boolean;
    /** Small attention dot beside the chevron (something here needs doing). */
    dot?: boolean;
  }
> = ({ onPress, value, external, dot, ...rest }) => {
  const { colors } = useAppTheme();
  const chevron = (
    <Icon
      name={external ? 'ExternalLink' : 'ChevronRight'}
      size={18}
      color={rest.destructive ? colors.foreground : colors.neutrals[500]}
    />
  );
  return (
    <TouchableOpacity onPress={onPress} disabled={rest.disabled} activeOpacity={0.7}>
      <RowShell
        {...rest}
        right={
          value ? (
            // Web's select trigger (SETTINGS_CONTROL_CLASS): the value in a
            // 36px pill with a chevron, not loose grey text.
            <View
              className="h-9 px-3 rounded-xl flex-row items-center bg-white/5 border border-theme-neutrals-700"
              style={{ gap: 6, maxWidth: 160 }}
            >
              <Text numberOfLines={1} className="text-white text-sm font-medium flex-shrink">
                {value}
              </Text>
              <Icon name="ChevronDown" size={16} color={colors.neutrals[400]} />
            </View>
          ) : dot ? (
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
              {chevron}
            </View>
          ) : (
            chevron
          )
        }
      />
    </TouchableOpacity>
  );
};

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
  const handleChange = comingSoon
    ? () => toastInfo(t('settings.comingSoon'))
    : onValueChange ?? (() => {});
  // The whole row flips the switch, as a native settings list does — the
  // label is the obvious thing to tap and used to do nothing. The row itself
  // stays out of the accessibility tree so the switch, named after the row,
  // is the one control a screen reader lands on.
  return (
    <TouchableOpacity
      onPress={() => handleChange(!value)}
      disabled={rest.disabled}
      activeOpacity={0.7}
      accessible={false}
    >
      <RowShell
        {...rest}
        disabled={rest.disabled || comingSoon}
        right={
          <CustomSwitch
            value={value}
            onValueChange={handleChange}
            disabled={rest.disabled}
            accessibilityLabel={rest.label}
          />
        }
      />
    </TouchableOpacity>
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
  <GlassModal scrollable
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
  <View className="mt-6 p-4 bg-white/5 rounded-xl flex-row items-start">
    <Icon name="Info" size={16} color="#8B8D90" />
    <Text className="text-theme-neutrals-500 text-sm ml-2 flex-1">{children}</Text>
  </View>
);
