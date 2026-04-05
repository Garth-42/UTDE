# Code Panel

The **Code Panel** slides up from the bottom of the viewport and displays the Python script that corresponds to the current strategy and selection.

## Opening the panel

The panel opens automatically when:

- You click **Preview Python Code** in the Strategy Panel.
- The server does not support `/generate-toolpath` and falls back to local code generation.
- You click **View Python Code** in the Toolpath Sidebar.

Close it with the **×** button in the panel toolbar.

## Toolbar actions

| Button | Action |
|---|---|
| **COPY** | Copies the full script to the clipboard. Changes to **COPIED ✓** briefly. |
| **▶ RUN** | Sends the script to the server (`/run-script`) and displays stdout/stderr below the code. |
| **⬇ G-CODE** | Downloads `output.nc` — only shown when the last run produced G-code output. |
| **×** | Closes the panel. |

## Code view

The generated script is displayed as read-only monospaced text. It is a valid UTDE Python script that can be copied out and run independently:

```python
from toolpath_engine import *

faces = [...]   # selected face indices
edges = [...]   # selected edge indices

strategy = RasterFillStrategy(spacing=2.0, angle=0, feed_rate=600)
rules    = [to_normal(0), lead(10)]

paths = strategy.generate(faces=faces, edges=edges)
paths.orient(*rules)

machine = Machine.gantry_5axis_ac(name="my_machine")
gcode   = PostProcessor(machine).process(paths)
print(gcode)
```

## Script output

After **▶ RUN** completes, an output pane appears below the code showing:

- A green **✓ SCRIPT SUCCEEDED** header and stdout on success.
- A red **✗ SCRIPT FAILED** header and stderr on failure.

If the script produced G-code (written to stdout), it is captured and made available via **⬇ G-CODE**.
