local source_path = arg[1]
if not source_path then
  io.stderr:write("missing Lua config path\n")
  os.exit(2)
end

local function normalize_path(path)
  path = path:gsub("\\", "/")
  local absolute = path:sub(1, 1) == "/"
  local parts = {}
  for part in path:gmatch("[^/]+") do
    if part == ".." then
      if #parts > 0 and parts[#parts] ~= ".." then
        table.remove(parts)
      elseif not absolute then
        parts[#parts + 1] = part
      end
    elseif part ~= "." and part ~= "" then
      parts[#parts + 1] = part
    end
  end
  local normalized = table.concat(parts, "/")
  if absolute then
    return "/" .. normalized
  end
  return normalized
end

local function dirname(path)
  return path:match("^(.*)/[^/]*$") or "."
end

local function basename(path)
  return path:match("([^/]+)$") or path
end

local config_root = dirname(normalize_path(source_path))
if basename(config_root) == "configs" then
  config_root = dirname(config_root)
end
local module_roots = {}
local module_root_list = os.getenv("HYPR_KEYMAP_LUA_ROOTS") or ""
for root in module_root_list:gmatch("[^\n]+") do
  module_roots[#module_roots + 1] = normalize_path(root)
end
if #module_roots == 0 then
  module_roots[1] = config_root
end
local allowed_files = {}
local allowed_file_list = os.getenv("HYPR_KEYMAP_LUA_FILES") or ""
for file in allowed_file_list:gmatch("[^\n]+") do
  allowed_files[normalize_path(file)] = true
end
allowed_files[normalize_path(source_path)] = true

local function lua_files_in(directory)
  local files = {}
  for file in pairs(allowed_files) do
    if dirname(file) == directory then
      files[#files + 1] = file
    end
  end
  table.sort(files)
  return files
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
      local result = {
        __proxy_path = path,
        __proxy_args = { ... },
        __proxy_called = true,
      }
      return setmetatable(result, {
        __index = function(_, key)
          if key == "set_enabled" then
            return function()
              return result
            end
          end
          return nil
        end,
      })
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
local source_override_key = "__hypr_keymap_source"
local line_override_key = "__hypr_keymap_line"

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
    local cleaned_options = {}
    local source_override = nil
    local line_override = nil
    if type(options) == "table" then
      source_override = options[source_override_key]
      line_override = options[line_override_key]
      for key, value in pairs(options) do
        if key ~= source_override_key and key ~= line_override_key then
          cleaned_options[key] = value
        end
      end
      if type(cleaned_options.description) == "string" then
        description = cleaned_options.description
      elseif type(cleaned_options.desc) == "string" then
        description = cleaned_options.desc
      end
    end
    local info = debug.getinfo(2, "Sl") or {}
    if source_override then
      info = {
        source = source_override,
        currentline = line_override or info.currentline,
      }
    end
    local record = {
      key = key,
      line = info.currentline or 0,
      source = info.source or ("@" .. source_path),
      action_path = action_data.path,
      action_args = action_data.args,
      action_literal = action_data.literal,
      action_literal_type = action_data.literal_type,
      options = cleaned_options,
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

local module_cache = {}
local loading_modules = {}

local function resolve_module_candidates(name, from_path)
  local absolute = name:sub(1, 1) == "/"
  local relative
  if name:match("%.lua$") then
    relative = name
  elseif name:find("/", 1, true) or absolute then
    relative = name .. ".lua"
  else
    relative = name:gsub("%.", "/") .. ".lua"
  end

  if absolute then
    return { normalize_path(relative) }
  end
  if name:sub(1, 2) == "./" or name:sub(1, 3) == "../" then
    return { normalize_path(dirname(from_path) .. "/" .. relative) }
  end

  local candidates = {}
  for _, root in ipairs(module_roots) do
    candidates[#candidates + 1] = normalize_path(root .. "/" .. relative)
  end
  return candidates
end

local function glob_to_lua_pattern(pattern)
  local escaped = pattern:gsub("([%^%$%(%)%%%.%[%]%+%-])", "%%%1")
  escaped = escaped:gsub("%*", ".*"):gsub("%?", ".")
  return "^" .. escaped .. "$"
end

local unpack_values = table.unpack or unpack
local shared_globals = {}
local o_table = setmetatable({}, {
  __newindex = function(target, key, value)
    if key == "bind" and type(value) == "function" then
      local helper_info = debug.getinfo(value, "S") or {}
      local helper_source = helper_info.source
      local original = value
      value = function(...)
        local args = { ... }
        local caller = debug.getinfo(2, "Sl") or {}
        if helper_source and caller.source == helper_source then
          caller = debug.getinfo(3, "Sl") or caller
        end

        local options = args[4]
        local wrapped_options = {}
        if type(options) == "table" then
          for option_key, option_value in pairs(options) do
            wrapped_options[option_key] = option_value
          end
        end
        if caller.source then
          wrapped_options[source_override_key] = caller.source
          wrapped_options[line_override_key] = caller.currentline
        end
        args[4] = wrapped_options
        return original(unpack_values(args, 1, 4))
      end
    end
    rawset(target, key, value)
  end,
})
shared_globals.o = o_table

local function make_environment(file_path, require_module)
  return setmetatable({
    hl = hl,
    require = function(name)
      return require_module(name, file_path)
    end,
  }, {
    __index = function(_, key)
      if shared_globals[key] ~= nil then
        return shared_globals[key]
      end
      return _G[key]
    end,
    __newindex = function(_, key, value)
      shared_globals[key] = value
    end,
  })
end

local function execute_file(file_path, require_module)
  local environment = make_environment(file_path, require_module)
  local chunk, load_error
  if _VERSION == "Lua 5.1" then
    chunk, load_error = loadfile(file_path)
    if chunk and setfenv then
      setfenv(chunk, environment)
    end
  else
    chunk, load_error = loadfile(file_path, "t", environment)
  end

  if not chunk then
    error("cannot load " .. file_path .. ": " .. tostring(load_error), 0)
  end

  local ok, result = pcall(chunk)
  if not ok then
    error("cannot execute " .. file_path .. ": " .. tostring(result), 0)
  end
  return result
end

local require_module

local function load_module_path(file_path)
  if module_cache[file_path] ~= nil then
    return module_cache[file_path]
  end
  if loading_modules[file_path] then
    return true
  end

  loading_modules[file_path] = true
  local ok, result = pcall(execute_file, file_path, require_module)
  loading_modules[file_path] = nil
  if not ok then
    error(result, 0)
  end

  if result == nil then
    result = true
  end
  module_cache[file_path] = result
  return module_cache[file_path]
end

require_module = function(name, from_path)
  local candidates = resolve_module_candidates(name, from_path)
  if candidates[1]:find("[*?]") then
    for _, resolved in ipairs(candidates) do
      local cache_key = "glob:" .. resolved
      if module_cache[cache_key] ~= nil then
        return module_cache[cache_key]
      end

      local pattern = glob_to_lua_pattern(basename(resolved))
      local directory = dirname(resolved)
      local matches = {}
      for _, file in ipairs(lua_files_in(directory)) do
        if basename(file):match(pattern) then
          matches[#matches + 1] = file
        end
      end
      if #matches > 0 then
        local result = {}
        for _, file in ipairs(matches) do
          local module_name = basename(file):gsub("%.lua$", "")
          result[module_name] = load_module_path(file)
        end
        module_cache[cache_key] = result
        return result
      end
    end
    error("required glob matched no Lua files: " .. name, 0)
  end

  for _, resolved in ipairs(candidates) do
    if allowed_files[resolved] then
      return load_module_path(resolved)
    end
  end
  error("required Lua module was not found under the configured module roots: " .. name, 0)
end

local ok, run_error = pcall(load_module_path, normalize_path(source_path))
if not ok then
  io.stderr:write(tostring(run_error) .. "\n")
  os.exit(2)
end

for _, record in ipairs(bindings) do
  io.write("HYPR_KEYMAP\t", json_encode(record, 0, {}), "\n")
end
