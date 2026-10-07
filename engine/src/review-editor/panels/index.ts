import "./panels.css";
import { registerPanel } from "../panels.ts";
import { CaptionsPanel } from "./captions.tsx";
import { ScenesPanel } from "./scenes.tsx";
import { CutsPanel } from "./cuts.tsx";
import { EffectsPanel } from "./effects.tsx";

registerPanel({ id: "captions", title: "الكابشن", order: 10, Component: CaptionsPanel });
registerPanel({ id: "scenes", title: "المشاهد", order: 20, Component: ScenesPanel });
registerPanel({ id: "cuts", title: "القص", order: 30, Component: CutsPanel });
registerPanel({ id: "effects", title: "المؤثرات", order: 40, Component: EffectsPanel });
