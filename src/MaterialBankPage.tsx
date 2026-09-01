import DailyMaterialPage from "./DailyMaterialPage";
import "./materialBank.css";

/**
 * 素材精读只保留独立的时事素材流。
 * 真题属于作答训练上下文，不再把整套卷材料搬进精读页。
 */
export default function MaterialBankPage() {
  return <DailyMaterialPage />;
}
