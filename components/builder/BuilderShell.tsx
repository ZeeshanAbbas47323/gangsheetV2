"use client";

import { useBuilder } from "@/lib/store";
import CanvasStage from "./CanvasStage";
import CropModal from "./CropModal";
import ExportModal from "./ExportModal";
import ExportQueue from "./ExportQueue";
import FooterSummary from "./FooterSummary";
import LibrarySidebar from "./LibrarySidebar";
import NestPanel from "./NestPanel";
import PlacementModal from "./PlacementModal";
import PropertiesPanel from "./PropertiesPanel";
import QualityCheckModal from "./QualityCheckModal";
import Ruler, { RULER_THICKNESS } from "./Ruler";
import SheetConfigPanel from "./SheetConfigPanel";
import SheetInfoPanel from "./SheetInfoPanel";
import SheetTabs from "./SheetTabs";
import ShortcutsModal from "./ShortcutsModal";
import Toasts from "./Toasts";
import Toolbar from "./Toolbar";

export default function BuilderShell() {
  const hasSelection = useBuilder((s) => s.selectedIds.length > 0);
  // NEW CHANGE: global custom-crop target, triggered from any "Crop" button
  const croppingAssetId = useBuilder((s) => s.croppingAssetId);
  const croppingAsset = useBuilder((s) =>
    s.assets.find((a) => a.id === s.croppingAssetId)
  );
  const setCroppingAsset = useBuilder((s) => s.setCroppingAsset);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-surface-0 text-gray-100">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <LibrarySidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <SheetTabs />
          <div className="flex shrink-0">
            <div
              className="shrink-0 border-b border-r border-surface-3 bg-surface-1"
              style={{ width: RULER_THICKNESS, height: RULER_THICKNESS }}
            />
            <div
              className="relative min-w-0 flex-1 overflow-hidden border-b border-surface-3"
              style={{ height: RULER_THICKNESS }}
            >
              <Ruler orientation="horizontal" />
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            <div
              className="relative shrink-0 overflow-hidden border-r border-surface-3"
              style={{ width: RULER_THICKNESS }}
            >
              <Ruler orientation="vertical" />
            </div>
            <div className="relative min-w-0 flex-1">
              <CanvasStage />
            </div>
          </div>
          <FooterSummary />
        </div>

        <aside className="w-72 shrink-0 overflow-y-auto border-l border-surface-3 bg-surface-1">
          {hasSelection && <PropertiesPanel />}
          <SheetInfoPanel />
          <NestPanel />
          <SheetConfigPanel />
        </aside>
      </div>

      <Toasts />
      <ShortcutsModal />
      <QualityCheckModal />
      <ExportModal />
      <ExportQueue />
      <PlacementModal />
      {croppingAssetId && croppingAsset && (
        <CropModal asset={croppingAsset} onClose={() => setCroppingAsset(null)} />
      )}
    </div>
  );
}
