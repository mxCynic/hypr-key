o = o or {}

function o.bind(keys, description, dispatcher, options)
  local opts = options or {}
  opts.description = description
  hl.bind(keys, hl.dsp.exec_cmd(dispatcher), opts)
end

return o
