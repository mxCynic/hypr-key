local mainMod = "SUPER + "
local functions = require("configs.function")

hl.bind(mainMod .. "Q", hl.dsp.exec_cmd(functions.terminal), { description = "Open terminal" })
hl.bind(mainMod .. "W", hl.dsp.window.float({ action = "toggle" }), { description = "Toggle floating window" })
hl.bind(mainMod .. "E", hl.dsp.exec_cmd("file-manager"), { description = "Open file manager" })
hl.bind(mainMod .. "A", hl.dsp.exec_cmd("volume-up"), { description = "音量 +10" })
hl.bind("F2", hl.dsp.exec_cmd("volume-down"), { locked = true, repeating = true, description = "降低音量" })
hl.bind(mainMod .. "mouse:272", hl.dsp.window.drag(), { mouse = true, description = "Drag window" })
hl.bind("XF86AudioPrev", hl.dsp.exec_cmd("playerctl previous"), { locked = true, description = "Previous track" })

hl.bind(mainMod .. "R", hl.dsp.submap("resize"), { description = "Enter resize mode" })
hl.define_submap("resize", function()
  hl.bind("H", hl.dsp.window.resize({ x = -20, y = 0, relative = true }), { repeating = true, description = "Resize left" })
  hl.bind("L", hl.dsp.window.resize({ x = 20, y = 0, relative = true }), { repeating = true, description = "Resize right" })
  hl.bind("K", hl.dsp.window.resize({ x = 0, y = 20, relative = true }), { repeating = true, description = "Resize up" })
  hl.bind("J", hl.dsp.window.resize({ x = 0, y = -20, relative = true }), { repeating = true, description = "Resize down" })
  hl.bind(mainMod .. "R", hl.dsp.submap("reset"), { description = "Exit resize mode" })
end)

hl.bind(mainMod .. "SPACE", hl.dsp.submap("test-launch"), { description = "Enter launcher mode" })
hl.define_submap("test-launch", function()
  hl.bind("T", hl.dsp.exec_cmd("kitty"), { description = "Open terminal" })
  hl.bind("B", hl.dsp.exec_cmd("launcher"), { description = "Open launcher" })
  hl.bind("E", hl.dsp.exec_cmd("file-manager"), { description = "Open file manager" })
  hl.bind(mainMod .. "SPACE", hl.dsp.submap("reset"), { description = "Exit launcher mode" })
end)

hl.bind(mainMod .. "M", hl.dsp.submap("test-move-window"), { description = "Enter move mode" })
hl.define_submap("test-move-window", function()
  for i = 1, 3 do
    hl.bind(tostring(i), hl.dsp.window.move({ workspace = i }), { description = ("Move window to workspace %d"):format(i) })
  end
  hl.bind(mainMod .. "M", hl.dsp.submap("reset"), { description = "Exit move mode" })
end)

hl.bind(mainMod .. "N", hl.dsp.submap("test-audio"), { description = "Enter audio mode" })
hl.define_submap("test-audio", function()
  hl.bind("M", hl.dsp.exec_cmd("volume-mute"), { description = "Mute audio" })
  hl.bind("J", hl.dsp.exec_cmd("volume-down"), { description = "Turn volume down" })
  hl.bind("K", hl.dsp.exec_cmd("volume-up"), { description = "Turn volume up" })
  hl.bind(mainMod .. "N", hl.dsp.submap("reset"), { description = "Exit audio mode" })
end)

for i = 1, 10 do
  local key = tostring(i % 10)
  local name = ("test-demo-%02d"):format(i)
  hl.bind(mainMod .. "ALT + " .. key, hl.dsp.submap(name), { description = ("Enter demo submap %02d"):format(i) })
  hl.define_submap(name, function()
    hl.bind("H", hl.dsp.focus({ direction = "left" }), { description = ("Demo %02d focus left"):format(i) })
    hl.bind("L", hl.dsp.focus({ direction = "right" }), { description = ("Demo %02d focus right"):format(i) })
    hl.bind("J", hl.dsp.focus({ workspace = "+1" }), { description = ("Demo %02d next workspace"):format(i) })
    hl.bind("K", hl.dsp.focus({ workspace = "-1" }), { description = ("Demo %02d previous workspace"):format(i) })
    hl.bind(mainMod .. "ALT + " .. key, hl.dsp.submap("reset"), { description = ("Exit demo submap %02d"):format(i) })
  end)
end
