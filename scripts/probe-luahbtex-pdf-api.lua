-- SPDX-License-Identifier: MIT

local root = arg[1]
if not root then
  io.stderr:write("usage: luahbtex --luaonly probe-luahbtex-pdf-api.lua FIXTURE_DIR\n")
  os.exit(2)
end

local function progress(message)
  if os.getenv("WASMTEX_PROBE_TRACE") then
    io.stderr:write("probe: ", message, "\n")
    io.stderr:flush()
  end
end

local function hex(value)
  if value == nil then return nil end
  return (value:gsub(".", function(byte) return string.format("%02x", string.byte(byte)) end))
end

local function quote(value)
  return '"' .. value:gsub('[%z\1-\31\\"]', function(char)
    local byte = string.byte(char)
    if char == '"' then return '\\"' end
    if char == '\\' then return '\\\\' end
    if char == '\n' then return '\\n' end
    if char == '\r' then return '\\r' end
    if char == '\t' then return '\\t' end
    return string.format('\\u%04x', byte)
  end) .. '"'
end

local function is_array(value)
  local count = 0
  local maximum = 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then return false end
    count = count + 1
    if key > maximum then maximum = key end
  end
  return count == maximum
end

local function json(value)
  local kind = type(value)
  if value == nil then return "null" end
  if kind == "boolean" then return value and "true" or "false" end
  if kind == "number" then return string.format("%.17g", value) end
  if kind == "string" then return quote(value) end
  if kind ~= "table" then error("cannot encode " .. kind) end
  local parts = {}
  if is_array(value) then
    for index = 1, #value do parts[#parts + 1] = json(value[index]) end
    return "[" .. table.concat(parts, ",") .. "]"
  end
  local keys = {}
  for key in pairs(value) do keys[#keys + 1] = key end
  table.sort(keys)
  for _, key in ipairs(keys) do
    parts[#parts + 1] = quote(key) .. ":" .. json(value[key])
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

local function packed(call)
  local values = table.pack(call())
  local result = { n = values.n, values = {} }
  for index = 1, values.n do
    local value = values[index]
    local kind = type(value)
    if kind == "string" then
      result.values[index] = { kind = "string", hex = hex(value) }
    elseif kind == "userdata" then
      local ok_length, length = pcall(function() return #value end)
      result.values[index] = {
        kind = "userdata",
        pdfe_type = pdfe.type(value),
        length = ok_length and length or nil,
      }
    elseif value == nil then
      result.values[index] = { kind = "nil" }
    else
      result.values[index] = { kind = kind, value = value }
    end
  end
  return result
end

local function dictionary_order(dictionary)
  local keys = {}
  for index = 1, #dictionary do
    local values = table.pack(pdfe.getfromdictionary(dictionary, index))
    keys[#keys + 1] = values[1]
  end
  return keys
end

local function scanner_result(source)
  local result = {}
  pdfscanner.scan(source, {
    ProbeOp = function(scanner)
      local reverse = {}
      while true do
        local value = scanner:pop()
        if value == nil then break end
        reverse[#reverse + 1] = value
      end
      for index = #reverse, 1, -1 do
        local value = reverse[index]
        if type(value[2]) == "string" then value[2] = hex(value[2]) end
        result[#result + 1] = value
      end
    end,
  }, {})
  return result
end

local result = {}
progress("classic open")
local classic = assert(pdfe.open(root .. "/classic.pdf"))
local catalog = assert(pdfe.getcatalog(classic))
local types = assert(pdfe.getarray(catalog, "Types"))
result.classic = {
  version = packed(function() return pdfe.getversion(classic) end),
  status = pdfe.getstatus(classic),
  pages = pdfe.getnofpages(classic),
  objects = pdfe.getnofobjects(classic),
  catalog_order = dictionary_order(catalog),
  types = {},
  literal_raw = packed(function() return pdfe.getstring(catalog, "Literal") end),
  literal_decoded = packed(function() return pdfe.getstring(catalog, "Literal", true) end),
  literal_syntax = packed(function() return pdfe.getstring(catalog, "Literal", false) end),
  hex_raw = packed(function() return pdfe.getstring(catalog, "Hex") end),
  hex_decoded = packed(function() return pdfe.getstring(catalog, "Hex", true) end),
  hex_syntax = packed(function() return pdfe.getstring(catalog, "Hex", false) end),
}
for index = 1, #types do
  result.classic.types[index] = packed(function() return pdfe.getfromarray(types, index) end)
end

local stream = assert(pdfe.getstream(catalog, "ProbeStream"))
progress("classic streams")
result.classic.stream_raw = packed(function() return pdfe.readwholestream(stream, false) end)
result.classic.stream_decoded = packed(function() return pdfe.readwholestream(stream, true) end)
assert(pdfe.openstream(stream, true))
local chunks = {}
while true do
  local chunk, count = pdfe.readfromstream(stream)
  if chunk == nil or count == 0 then break end
  chunks[#chunks + 1] = chunk
end
pdfe.closestream(stream)
result.classic.stream_chunked_decoded = hex(table.concat(chunks))
progress("scanner string")
result.classic.scanner_string = scanner_result(
  "10 2.5 true /N#61me (A\\000B) [1 2] << /K (V) >> ProbeOp\n"
)
progress("scanner stream")
result.classic.scanner_stream = scanner_result(stream)

progress("xref/object stream")
local modern = assert(pdfe.open(root .. "/xref-object-stream.pdf"))
result.xref_object_stream = {
  pages = pdfe.getnofpages(modern),
  objects = pdfe.getnofobjects(modern),
  catalog_type = pdfe.type(pdfe.getcatalog(modern)),
}

progress("encrypted")
local encrypted = assert(pdfe.open(root .. "/encrypted.pdf"))
result.encrypted = {
  initial_status = pdfe.getstatus(encrypted),
  initial_pages = pdfe.getnofpages(encrypted),
  wrong = pdfe.unencrypt(encrypted, "wrong"),
}
result.encrypted.after_wrong_status = pdfe.getstatus(encrypted)
result.encrypted.correct = pdfe.unencrypt(encrypted, "user")
result.encrypted.final_status = pdfe.getstatus(encrypted)
result.encrypted.final_pages = pdfe.getnofpages(encrypted)

progress("damaged")
local damaged = pdfe.open(root .. "/damaged-repairable.pdf")
result.damaged = damaged and {
  opened = true,
  pages = pdfe.getnofpages(damaged),
  objects = pdfe.getnofobjects(damaged),
} or { opened = false }

progress("cleanup")
pdfe.close(classic)
pdfe.close(modern)
pdfe.close(encrypted)
if damaged then pdfe.close(damaged) end
classic, catalog, types, stream, modern, encrypted, damaged = nil, nil, nil, nil, nil, nil, nil
collectgarbage("collect")
collectgarbage("collect")

progress("write JSON")
io.write("WASMTEX_PDF_API_JSON=", json(result), "\n")
