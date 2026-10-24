import EditorGuidePanel from "./EditorGuidePanel";
import ReusableElementsPanel from "./ReusableElementsPanel";
import PagePaletteControls from "./PagePaletteControls";
import ColourPickerButton from "./ColourPickerButton";
import RepeatGridPanel from "./RepeatGridPanel";
import DesignToolSearch from "./DesignToolSearch";
import DocumentElementsPanel from "./DocumentElementsPanel";
import PagesManagerPanel from "./PagesManagerPanel";
import ResizeDesignPanel from "./ResizeDesignPanel";
import { DESIGN_PANEL_NAMES, designSelectionAction } from "../../libs/editor/designPanels";
import VectorSymbolsPanel from "./VectorSymbolsPanel";
import DesignClipboardControls from "./DesignClipboardControls";
import ConnectorsPanel from "./ConnectorsPanel";
import PageAnimationPanel from "./PageAnimationPanel";
import BulkCreatePanel from "./BulkCreatePanel";
import { DesignDraftContext } from "./DesignDraftInput";
import type { ProjectEditLease } from "../../libs/editor/projectEditGate";
import { DesignDraftInput as TextInput } from "./DesignDraftInput";
import React, { useState } from "react";
import { Keyboard, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { applyDesignPalette, applyDesignStyle, copyDesignStyle, designColours, DESIGN_PALETTES, replaceDesignColour, type DesignStyle } from "../../libs/editor/designTools";
import type { ProjectSnapshot } from "../../libs/editor/types";
import DesignTextSearch from "./DesignTextSearch";
import DataVisualPanel from "./DataVisualPanel";
import FillPanel from "./FillPanel";
import type { DesignLayoutBox } from "../../libs/editor/designLayout";
import GroupsPanel from "./GroupsPanel";
import QrPanel from "./QrPanel";
import TextCompositionsPanel from "./TextCompositionsPanel";
import PhotoGridPanel from "./PhotoGridPanel";
import DesignLinkPanel from "./DesignLinkPanel";
import PageNotesPanel from "./PageNotesPanel";
import GuidesPanel from "./GuidesPanel";

export default function DesignTools({ project, selectedId, current, commit, seek, time, select, holdEdits, boxes, recording, onPresent, onEditContent, onPageChange }: {
  onPageChange?: (time: number) => void; onPresent?: () => void; onEditContent?: (id: string) => void;
  boxes: () => DesignLayoutBox[]; recording?: boolean;
  project: ProjectSnapshot; selectedId: string | null; holdEdits: () => ProjectEditLease | null;
  current: () => ProjectSnapshot | null; commit: (next: ProjectSnapshot) => void;
  seek: (id: string, time: number) => void; time: number; select: (id: string | null) => void;
}) {
  const { t } = useTranslation();
  const [clipboard, setClipboard] = useState<{ projectId: string; style: DesignStyle } | null>(null);
  const [panel, setPanel] = useState<"resize" | "colours" | "search" | "data" | "fill" | "groups" | "qr" | "insert" | "grid" | "guides" | "notes" | "link" | "compositions" | "bulk" | "animate" | "connectors" | "symbols" | "pages" | "document" | "repeat" | "elements" | "help" | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [replacement, setReplacement] = useState("#ffffff");
  const selected = project.clips.find(c => c.id === selectedId);
  const contextual = selected ? designSelectionAction(selected) : null;
  const panelTitle = panel ? t(`editor.designTools.panel.${panel}`, { defaultValue: DESIGN_PANEL_NAMES[panel] }) : "";
  const editSelected = () => {
    if (!contextual || !selected || selected.locked) return;
    Keyboard.dismiss();
    if (contextual.panel) setPanel(contextual.panel);
    else { setPanel(null); onEditContent?.(selected.id); }
  };
  const style = clipboard?.projectId === project.id ? clipboard.style : null;
  const apply = (operation: (value: ProjectSnapshot) => ProjectSnapshot) => {
    const latest = current();
    if (!latest || latest.id !== project.id) return;
    const next = operation(latest);
    if (next !== latest) commit(next);
  };
  const action = (label: string, onPress: () => void, disabled = false, active = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ disabled, selected: active }} disabled={disabled} onPress={onPress} className={`min-h-[40px] justify-center rounded-lg px-3 ${active ? "bg-white/15" : "bg-white/5"}`} style={{ opacity: disabled ? 0.35 : 1 }}><Text className="text-xs text-white">{label}</Text></Pressable>;
  return <DesignDraftContext.Provider value={holdEdits}><View className="border-b border-white/10 py-2" style={{ gap: 10 }}>
    <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
      <DesignToolSearch onChoose={id => { Keyboard.dismiss(); if (id === "pages") onPageChange?.(time); setPanel(id === "layout" ? "groups" : id); }} />
      {action(t("editor.present.title", { defaultValue: "Present pages" }), () => { setPanel(null); onPresent?.(); }, !onPresent)}
      {action(t("editor.designTools.insert", { defaultValue: "Insert" }), () => setPanel(panel === "insert" ? null : "insert"), false, ["insert", "data", "fill", "qr", "grid", "guides", "compositions", "bulk", "connectors", "symbols", "document", "repeat"].includes(panel ?? ""))}
      {contextual && action(t(`editor.selectionAction.${contextual.id}`, { defaultValue: contextual.label }), editSelected, !!selected?.locked || (!contextual.panel && !onEditContent))}
      <DesignClipboardControls project={project} selectedId={selectedId} time={time} current={current} commit={commit} select={select} />
      {action(t("editor.designTools.resize", { defaultValue: "Resize" }), () => setPanel(panel === "resize" ? null : "resize"), false, panel === "resize")}
      {action(t("editor.designTools.colours", { defaultValue: "Document colours" }), () => setPanel(panel === "colours" ? null : "colours"), false, panel === "colours")}
      {action(t("editor.designTools.copyStyle", { defaultValue: "Copy style" }), () => {
        const latest = current();
        const clip = latest?.clips.find(c => c.id === selectedId);
        const value = clip && copyDesignStyle(clip);
        if (latest && value) setClipboard({ projectId: latest.id, style: value });
      }, !selected || selected.kind === "audio")}
      {action(t("editor.designTools.pasteStyle", { defaultValue: "Paste style" }), () => style && selectedId && apply(p => applyDesignStyle(p, [selectedId], style)), !style || !selected || selected.kind === "audio" || !!selected.locked)}
      {action(t("editor.designTools.findReplace", { defaultValue: "Find and replace" }), () => setPanel(panel === "search" ? null : "search"), false, panel === "search")}
      {action(t("editor.links.title", { defaultValue: "Link" }), () => setPanel(panel === "link" ? null : "link"), !selected || selected.kind === "audio", panel === "link")}
      {action(t("editor.pageAnimation.title", { defaultValue: "Animate page" }), () => setPanel(panel === "animate" ? null : "animate"), false, panel === "animate")}
      {action(t("editor.pageManager.title", { defaultValue: "Manage pages" }), () => { onPageChange?.(time); setPanel(panel === "pages" ? null : "pages"); }, false, panel === "pages")}
      {action(t("editor.notes.title", { defaultValue: "Page notes" }), () => setPanel(panel === "notes" ? null : "notes"), false, panel === "notes")}
      {action(t("editor.help.title", { defaultValue: "Editor guide" }), () => setPanel(panel === "help" ? null : "help"), false, panel === "help")}
      {action(t("editor.layout.positionGroups", { defaultValue: "Position and groups" }), () => setPanel(panel === "groups" ? null : "groups"), false, panel === "groups")}
    </ScrollView>
    {panel && <ScrollView stickyHeaderIndices={[0]} nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
    <View className="flex-row items-center justify-between border-b border-white/10 px-3 py-2" style={{ backgroundColor: "#0a0a0a", gap: 10 }}><Text className="flex-1 text-xs font-semibold text-white/75">{panelTitle}</Text><Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setPanel(null); }} className="min-h-[40px] justify-center rounded-lg px-3"><Text className="text-xs text-white/50">{t("editor.designTools.closePanel", { defaultValue: "Close panel" })}</Text></Pressable></View>
    {panel === "insert" && <View className="flex-row flex-wrap px-3" style={{ gap: 8 }}>
      {action(t("editor.elements.title", { defaultValue: "Saved elements" }), () => setPanel("elements"))}
      {action(t("editor.repeat.title", { defaultValue: "Repeat selection in a grid" }), () => setPanel("repeat"))}
      {action(t("editor.document.title", { defaultValue: "Page numbers and repeated elements" }), () => setPanel("document"))}
      {action(t("editor.symbols.title", { defaultValue: "Vector symbols" }), () => setPanel("symbols"))}
      {action(t("editor.connectors.title", { defaultValue: "Lines and connectors" }), () => setPanel("connectors"))}
      {action(t("editor.bulk.title", { defaultValue: "Bulk create" }), () => setPanel("bulk"))}
      {action(t("editor.dataVisual.title", { defaultValue: "Charts and tables" }), () => setPanel("data"))}
      {action(t("editor.fills.heading", { defaultValue: "Fills and backgrounds" }), () => setPanel("fill"))}
      {action(t("editor.guides.title", { defaultValue: "Guides and margins" }), () => setPanel("guides"))}
      {action(t("editor.compositions.title", { defaultValue: "Text combinations" }), () => setPanel("compositions"))}
      {action(t("editor.grids.title", { defaultValue: "Photo grids" }), () => setPanel("grid"))}
      {action(t("editor.qr.title", { defaultValue: "QR code" }), () => setPanel("qr"))}
    </View>}
    {["elements", "data", "fill", "qr", "grid", "guides", "compositions", "bulk", "connectors", "symbols", "document", "repeat"].includes(panel ?? "") && <View className="px-3">{action(t("editor.designTools.backInsert", { defaultValue: "Back to Insert" }), () => setPanel("insert"))}</View>}
    {panel === "help" && <EditorGuidePanel onOpen={id => setPanel(id === "layout" ? "groups" : id)} />}
    {panel === "elements" && <ReusableElementsPanel key={project.id} project={project} selectedId={selectedId} time={time} current={current} commit={commit} select={select} />}
    {panel === "repeat" && <RepeatGridPanel key={project.id} project={project} time={time} selectedId={selectedId} current={current} commit={commit} select={select} boxes={boxes} />}
    {panel === "document" && <DocumentElementsPanel key={project.id} project={project} time={time} selectedId={selectedId} current={current} commit={commit} />}
    {panel === "pages" && <PagesManagerPanel key={project.id} selectedId={selectedId} project={project} time={time} current={current} commit={commit} select={select} onPick={onPageChange} />}
    {panel === "symbols" && <VectorSymbolsPanel key={project.id} project={project} time={time} selectedId={selectedId} current={current} commit={commit} select={select} />}
    {panel === "connectors" && <ConnectorsPanel key={project.id} project={project} time={time} selectedId={selectedId} current={current} commit={commit} select={select} />}
    {panel === "animate" && <PageAnimationPanel key={project.id} project={project} time={time} selectedId={selectedId} current={current} commit={commit} />}
    {panel === "bulk" && <BulkCreatePanel key={project.id} project={project} time={time} current={current} commit={commit} seek={seek} />}
    {panel === "link" && <DesignLinkPanel project={project} selectedId={selectedId} current={current} commit={commit} time={time} />}
    {panel === "notes" && <PageNotesPanel project={project} time={time} current={current} commit={commit} />}
    {panel === "guides" && <GuidesPanel project={project} current={current} commit={commit} />}
    {panel === "compositions" && <TextCompositionsPanel project={project} current={current} commit={commit} time={time} select={select} />}
    {panel === "grid" && <PhotoGridPanel project={project} current={current} commit={commit} time={time} select={select} selectedId={selectedId} />}
    {panel === "qr" && <QrPanel project={project} selectedId={selectedId} current={current} commit={commit} time={time} select={select} />}
    {panel === "groups" && <GroupsPanel boxes={boxes} recording={recording} project={project} selectedId={selectedId} current={current} commit={commit} time={time} select={select} />}
    {panel === "fill" && <FillPanel project={project} selectedId={selectedId} current={current} commit={commit} time={time} select={select} />}
    {panel === "data" && <DataVisualPanel project={project} selectedId={selectedId} current={current} commit={commit} time={time} select={select} />}
    {panel === "search" && <DesignTextSearch project={project} time={time} selectedId={selectedId} apply={apply} seek={seek} />}
    {panel === "resize" && <ResizeDesignPanel key={project.id} project={project} current={current} commit={commit} />}
    {panel === "colours" && <View className="px-3" style={{ gap: 10 }}>
      <PagePaletteControls canPick={!!colour} key={project.id} project={project} time={time} current={current} commit={commit} onPick={setReplacement} />
      <Text className="text-xs text-white/60">{t("editor.designTools.colourHint", { defaultValue: "Choose a colour to replace across this design. Locked layers are preserved." })}</Text>
      <ScrollView keyboardShouldPersistTaps="handled" horizontal contentContainerStyle={{ gap: 10 }}>
        {designColours(project).map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: colour === value }} onPress={() => { setColour(value); setReplacement(value); }} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: value, borderWidth: 2, borderColor: colour === value ? "#38bdf8" : "#888" }} />)}
      </ScrollView>
      {colour && <View className="flex-row items-center" style={{ gap: 8 }}>
        <Text className="text-xs text-white/60">{colour} →</Text>
        <TextInput accessibilityLabel={t("editor.designTools.replacement", { defaultValue: "Replacement colour" })} value={replacement} onChangeText={setReplacement} maxLength={7} autoCapitalize="none" autoCorrect={false} className="min-h-[40px] flex-1 rounded-lg border border-white/20 px-3 text-white" />
        <ColourPickerButton projectId={project.id} onPick={setReplacement} />{action(t("editor.designTools.changeAll", { defaultValue: "Change all" }), () => { apply(p => replaceDesignColour(p, colour, replacement)); setColour(replacement); }, !/^#[0-9a-f]{6}$/i.test(replacement) || colour === replacement)}
      </View>}
      <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {DESIGN_PALETTES.map(palette => <Pressable key={palette.id} accessibilityRole="button" onPress={() => apply(p => applyDesignPalette(p, palette.colours))} className="rounded-lg border border-white/15 px-3 py-2" style={{ gap: 6 }}>
          <View className="flex-row overflow-hidden rounded">{palette.colours.map(value => <View key={value} style={{ width: 20, height: 18, backgroundColor: value }} />)}</View><Text className="text-xs text-white">{t(`editor.designTools.palette.${palette.id}`, { defaultValue: palette.label })}</Text>
        </Pressable>)}
      </ScrollView>
    </View>}
    </ScrollView>}
  </View></DesignDraftContext.Provider>;
}
