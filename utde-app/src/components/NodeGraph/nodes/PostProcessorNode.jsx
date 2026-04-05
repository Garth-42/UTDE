import { Handle, Position } from "reactflow";
import { NODE_COLORS, nodeWrap, nodeHeader, nodeBody, paramRow, paramKey, paramValue } from "./nodeStyles";

const COLOR = NODE_COLORS.post_processor;

const MACHINE_LABELS = {
  gantry_5axis_ac: "5-Axis AC",
  gantry_5axis_bc: "5-Axis BC",
  cartesian_3axis: "3-Axis XYZ",
  generic_6dof_robot: "6-DOF Robot",
};

export default function PostProcessorNode({ data, selected }) {
  const { params } = data;

  return (
    <div style={nodeWrap(COLOR, selected)}>
      <Handle type="target" position={Position.Left} id="toolpath_in"
        style={{ top: "50%", background: COLOR, width: 8, height: 8, border: "2px solid #fff" }} />

      <div style={nodeHeader(COLOR)}>
        <span>↓</span> POST PROCESSOR
      </div>
      <div style={nodeBody}>
        <div style={paramRow}>
          <span style={paramKey}>machine</span>
          <span style={paramValue}>{MACHINE_LABELS[params.machine] ?? params.machine}</span>
        </div>
        <div style={paramRow}>
          <span style={paramKey}>WCS</span>
          <span style={paramValue}>{params.wcs_register}</span>
        </div>
        <div style={{ ...paramRow, marginTop: 2 }}>
          <span style={{ fontSize: 9, color: "#aaa" }}>G-code output</span>
        </div>
      </div>
    </div>
  );
}
