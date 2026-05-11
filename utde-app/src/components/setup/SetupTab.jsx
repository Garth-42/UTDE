/**
 * SetupTab — three-column workspace.
 *
 * Layout: 268px Timeline | 1fr SetupViewport | 320px RightPanel.
 */

import Timeline from "./Timeline";
import RightPanel from "./RightPanel";
import SetupViewport from "./SetupViewport";

const STYLES = {
  shell: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "268px 1fr 320px",
    gap: 10,
    padding: 10,
    minHeight: 0,
  },
};

export default function SetupTab() {
  return (
    <div style={STYLES.shell}>
      <Timeline />
      <SetupViewport />
      <RightPanel />
    </div>
  );
}
