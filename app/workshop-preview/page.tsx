import { WorkshopClaudePreview } from "@/components/workshop-preview/workshop-claude-preview";
import "./workshop-preview.css";

export const metadata = {
  title: "工坊预览 · Claude 风（第一批）",
  description: "Float 工坊 Claude 风界面预览——独立路由，不影响正式工坊。",
};

export default function WorkshopPreviewPage() {
  return <WorkshopClaudePreview />;
}
