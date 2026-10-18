local source_path = arg[1]
if not source_path then
  io.stderr:write("missing binds path\n")
  os.exit(2)
end

local function json_escape(text)
  return (text:gsub('[%z\1-\31\\"]', function(char)
    if char == "\\" then return "\\\\" end
    if char == '"' then return '\\"' end
    if char == "\b" then return "\\b" end
    if char == "\f" then return "\\f" end
    if char == "\n" then return "\\n" end
    if char == "\r" then return "\\r" end
    if char == "\t" then return "\\t" end
    return string.format("\\u%04x", char:byte())
  end))
end

local function json_encode(value, depth, seen)
  local value_type = type(value)
  if value_type == "nil" then return "null" end
  if value_type == "boolean" then return value and "true" or "false" end
  if value_type == "number" then
    if value ~= value or value == math.huge or value == -math.huge then
      return "null"
    end
    return tostring(value)
  end
  if value_type == "string" then
    return '"' .. json_escape(value) .. '"'
  end
  if value_type ~= "table" then
    return '"<' .. json_escape(value_type) .. '>"'
  end

  depth = depth or 0
  if depth > 8 then return '{"__truncated":true}' end
  seen = seen or {}
  if seen[value] then return '{"__cycle":true}' end
  seen[value] = true

  local is_array = true
  local max_index = 0
  local key_count = 0
  for key, _ in pairs(value) do
    key_count = key_count + 1
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
      is_array = false
    elseif key > max_index then
      max_index = key
    end
  end
  if key_count ~= max_index then is_array = false end

  local parts = {}
  if is_array then
    for index = 1, max_index do
      parts[#parts + 1] = json_encode(value[index], depth + 1, seen)
    end
    seen[value] = nil
    return "[" .. table.concat(parts, ",") .. "]"
  end

  local keys = {}
  for key, _ in pairs(value) do
    keys[#keys + 1] = tostring(key)
  end
  table.sort(keys)
  for _, key in ipairs(keys) do
    local item = value[key]
    if item == nil then
      for candidate_key, candidate_value in pairs(value) do
        if tostring(candidate_key) == key then
          item = candidate_value
          break
        end
      end
    end
    parts[#parts + 1] = '"' .. json_escape(key) .. '":' .. json_encode(item, depth + 1, seen)
  end
  seen[value] = nil
  return "{" .. table.concat(parts, ",") .. "}"
end

local function proxy(path)
  local value = { __proxy_path = path }
  return setmetatable(value, {
    __index = function(_, key)
      return proxy(path .. "." .. tostring(key))
    end,
    __call = function(_, ...)
      return {
        __proxy_path = path,
        __proxy_args = { ... },
        __proxy_called = true,
      }
    end,
  })
end

local function action_info(value)
  if type(value) ~= "table" then
    return {
      path = "",
      args = {},
      literal = value,
      literal_type = type(value),
    }
  end
  local path = rawget(value, "__proxy_path")
  if path then
    return {
      path = path,
      args = rawget(value, "__proxy_args") or {},
      called = rawget(value, "__proxy_called") == true,
    }
  end
  return { path = "", args = {}, literal = value, literal_type = "table" }
end

local bindings = {}
local current_submap = "global"

local function binding_handle(record)
  local handle = {}

  function handle:set_enabled(enabled)
    record.enabled = enabled ~= false
    return self
  end

  return setmetatable(handle, {
    __index = function()
      return function()
        return handle
      end
    end,
  })
end

local function run_submap(name, callback)
  local previous = current_submap
  current_submap = name
  local ok, callback_error = pcall(callback)
  current_submap = previous
  if not ok then
    error(callback_error, 0)
  end
end

local hl = {
  bind = function(key, action, options)
    if type(key) ~= "string" then
      error("hl.bind() key argument must be a string", 2)
    end
    local info = debug.getinfo(2, "Sl") or {}
    local action_data = action_info(action)
    local description = ""
    if type(options) == "table" then
      if type(options.description) == "string" then
        description = options.description
      elseif type(options.desc) == "string" then
        description = options.desc
      end
    end
    local record = {
      key = key,
      line = info.currentline or 0,
      source = info.source or ("@" .. source_path),
      action_path = action_data.path,
      action_args = action_data.args,
      action_literal = action_data.literal,
      action_literal_type = action_data.literal_type,
      options = type(options) == "table" and options or {},
      options_type = type(options),
      description = description,
      submap = current_submap,
      enabled = true,
    }
    bindings[#bindings + 1] = record
    return binding_handle(record)
  end,
  define_submap = function(name, reset_or_callback, callback)
    if type(name) ~= "string" then
      error("hl.define_submap() name must be a string", 2)
    end
    local body = nil
    if type(reset_or_callback) == "function" then
      body = reset_or_callback
    elseif type(callback) == "function" then
      body = callback
    end
    if body then
      run_submap(name, body)
    end
  end,
  get_current_submap = function()
    return current_submap
  end,
}

setmetatable(hl, {
  __index = function(_, key)
    return proxy("hl." .. tostring(key))
  end,
})

local environment = setmetatable({
  hl = hl,
  require = function()
    return proxy("functions")
  end,
}, {
  __index = _G,
})

local chunk, load_error
if _VERSION == "Lua 5.1" then
  chunk, load_error = loadfile(source_path)
  if chunk and setfenv then setfenv(chunk, environment) end
else
  chunk, load_error = loadfile(source_path, "t", environment)
end

if not chunk then
  io.stderr:write("cannot load binds: " .. tostring(load_error) .. "\n")
  os.exit(2)
end

local ok, run_error = pcall(chunk)
if not ok then
  io.stderr:write("cannot execute binds: " .. tostring(run_error) .. "\n")
  os.exit(2)
end

for _, record in ipairs(bindings) do
  io.write("HYPR_KEYMAP\t", json_encode(record, 0, {}), "\n")
end
