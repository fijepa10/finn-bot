const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_TEXT = "qwen/qwen3-32b";
const MODEL_VISION = "meta-llama/llama-4-scout-17b-16e-instruct";
const API_KEY = "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";
const FALLBACK_PERSONALITY = "You are a helpful assistant called Finn Bot. Never use emojis.";

const COLOR_PRESETS = {
  green:  { accent: "#00ff41", dim: "#00b32d", dark: "#003b0f", user: "#33ff66" },
  red:    { accent: "#ff3333", dim: "#b32222", dark: "#3b0f0f", user: "#ff6666" },
  blue:   { accent: "#3399ff", dim: "#2266bb", dark: "#0f1f3b", user: "#66bbff" },
  purple: { accent: "#b366ff", dim: "#7733cc", dark: "#1f0f3b", user: "#cc99ff" },
  orange: { accent: "#ff9933", dim: "#cc7722", dark: "#3b1f0f", user: "#ffbb66" },
  pink:   { accent: "#ff66b2", dim: "#cc3388", dark: "#3b0f22", user: "#ff99cc" },
  cyan:   { accent: "#00ffff", dim: "#00b3b3", dark: "#003b3b", user: "#33ffff" },
  yellow: { accent: "#ffff33", dim: "#b3b322", dark: "#3b3b0f", user: "#ffff66" },
  white:  { accent: "#e0e0e0", dim: "#999999", dark: "#222222", user: "#ffffff" },
};

// ── State ──
let customPersonality = localStorage.getItem("finnbot_personality") || "";
let currentColor = localStorage.getItem("finnbot_color") || "green";
// Clear old chat data from previous versions
const APP_VERSION = "3";
if (localStorage.getItem("finnbot_version") !== APP_VERSION) {
  localStorage.removeItem("finnbot_chats");
  localStorage.removeItem("finnbot_active_chat");
  localStorage.setItem("finnbot_version", APP_VERSION);
}
let chats = JSON.parse(localStorage.getItem("finnbot_chats") || "{}");
let activeChatId = localStorage.getItem("finnbot_active_chat") || null;
let replyingTo = null; // { index, text, sender }
let pendingImage = null; // base64 data URL

// ── DOM ──
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const clearBtn = document.getElementById("clear-btn");
const deleteChatBtn = document.getElementById("delete-chat-btn");
const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsClose = document.getElementById("settings-close");
const personalityInput = document.getElementById("personality-input");
const savePersonality = document.getElementById("save-personality");
const saveStatus = document.getElementById("save-status");
const colorBtns = document.querySelectorAll(".color-btn");
const chatList = document.getElementById("chat-list");
const newChatBtn = document.getElementById("new-chat-btn");
const chatTitle = document.getElementById("chat-title");
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebar = document.getElementById("sidebar");
const replyBar = document.getElementById("reply-bar");
const replyPreview = document.getElementById("reply-preview");
const replyCancel = document.getElementById("reply-cancel");
const imageInput = document.getElementById("image-input");
const imageBtn = document.getElementById("image-btn");
const imageBar = document.getElementById("image-bar");
const imagePreviewThumb = document.getElementById("image-preview-thumb");
const imageCancel = document.getElementById("image-cancel");

// ── Init ──
function init() {
  personalityInput.value = customPersonality;
  applyColor(currentColor);

  // If no chats exist, create one
  if (Object.keys(chats).length === 0) {
    createNewChat();
  } else if (!activeChatId || !chats[activeChatId]) {
    activeChatId = Object.keys(chats)[0];
  }
  loadChat(activeChatId);
  renderChatList();

  chatForm.addEventListener("submit", handleSend);
  clearBtn.addEventListener("click", clearChat);
  deleteChatBtn.addEventListener("click", deleteChat);
  newChatBtn.addEventListener("click", () => { createNewChat(); renderChatList(); });

  settingsBtn.addEventListener("click", () => {
    settingsOverlay.style.display = "flex";
    personalityInput.focus();
  });
  settingsClose.addEventListener("click", () => {
    settingsOverlay.style.display = "none";
    chatInput.focus();
  });
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) {
      settingsOverlay.style.display = "none";
      chatInput.focus();
    }
  });
  savePersonality.addEventListener("click", () => {
    customPersonality = personalityInput.value.trim();
    localStorage.setItem("finnbot_personality", customPersonality);
    saveStatus.textContent = "saved.";
    setTimeout(() => { saveStatus.textContent = ""; }, 2000);
  });

  // Voice select
  const voiceSelect = document.getElementById("voice-select");
  const previewVoice = document.getElementById("preview-voice");
  voiceSelect.value = selectedVoiceId;
  voiceSelect.addEventListener("change", () => {
    selectedVoiceId = voiceSelect.value;
    localStorage.setItem("finnbot_voice_id", selectedVoiceId);
  });
  previewVoice.addEventListener("click", async () => {
    previewVoice.textContent = "playing...";
    previewVoice.disabled = true;
    const name = voiceSelect.options[voiceSelect.selectedIndex].text.split("—")[0].trim();
    await speakWithElevenLabs(`Hey, this is ${name}. How do I sound?`);
    previewVoice.textContent = "preview";
    previewVoice.disabled = false;
  });

  colorBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = btn.dataset.color;
      applyColor(color);
      currentColor = color;
      localStorage.setItem("finnbot_color", color);
    });
  });

  sidebarToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  replyCancel.addEventListener("click", cancelReply);

  // Image upload
  imageBtn.addEventListener("click", () => imageInput.click());
  imageCancel.addEventListener("click", cancelImage);
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingImage = reader.result;
      imagePreviewThumb.src = pendingImage;
      imageBar.style.display = "flex";
    };
    reader.readAsDataURL(file);
    imageInput.value = "";
  });

  // Paste image from clipboard
  chatInput.addEventListener("paste", (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = () => {
          pendingImage = reader.result;
          imagePreviewThumb.src = pendingImage;
          imageBar.style.display = "flex";
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  });

  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatForm.dispatchEvent(new Event("submit"));
    }
    if (e.key === "Escape") cancelReply();
  });

  chatInput.focus();
}

// ── Chat Management ──
function createNewChat() {
  const id = "chat_" + Date.now();
  chats[id] = { name: "new chat", messages: [], history: [] };
  activeChatId = id;
  saveChats();
  loadChat(id);
  renderChatList();
}

function loadChat(id) {
  activeChatId = id;
  localStorage.setItem("finnbot_active_chat", id);
  const chat = chats[id];
  chatTitle.textContent = chat.name;
  cancelReply();
  renderMessages();
  sidebar.classList.remove("open");
  chatInput.focus();
}

function deleteChat() {
  if (Object.keys(chats).length <= 1) {
    clearChat();
    return;
  }
  delete chats[activeChatId];
  saveChats();
  activeChatId = Object.keys(chats)[0];
  loadChat(activeChatId);
  renderChatList();
}

function clearChat() {
  const chat = chats[activeChatId];
  chat.messages = [];
  chat.history = [];
  chat.name = "new chat";
  saveChats();
  chatTitle.textContent = chat.name;
  cancelReply();
  renderMessages();
}

function saveChats() {
  localStorage.setItem("finnbot_chats", JSON.stringify(chats));
}

function renderChatList() {
  chatList.innerHTML = "";
  const ids = Object.keys(chats).reverse();
  for (const id of ids) {
    const item = document.createElement("div");
    item.className = "chat-list-item" + (id === activeChatId ? " active" : "");
    item.innerHTML = `<span class="chat-name">${escapeHtml(chats[id].name)}</span>`;
    item.addEventListener("click", () => { loadChat(id); renderChatList(); });
    chatList.appendChild(item);
  }
}

// ── Auto-name chat from first user message ──
function autoNameChat(text) {
  const chat = chats[activeChatId];
  if (chat.name === "new chat") {
    chat.name = text.length > 30 ? text.slice(0, 30) + "..." : text;
    chatTitle.textContent = chat.name;
    renderChatList();
  }
}

// ── Reply ──
function setReply(index) {
  const chat = chats[activeChatId];
  const msg = chat.messages[index];
  if (!msg) return;
  replyingTo = { index, text: msg.text, sender: msg.sender };
  const preview = msg.text.length > 50 ? msg.text.slice(0, 50) + "..." : msg.text;
  replyPreview.textContent = preview;
  replyBar.style.display = "flex";
  chatInput.focus();
}

function cancelReply() {
  replyingTo = null;
  replyBar.style.display = "none";
}

function cancelImage() {
  pendingImage = null;
  imageBar.style.display = "none";
}

// ── Render Messages ──
function renderMessages() {
  const chat = chats[activeChatId];
  chatMessages.innerHTML = "";

  if (chat.messages.length === 0) {
    chatMessages.innerHTML = `
      <div class="message bot-message">
        <div class="message-row">
          <span class="msg-prefix">[finn]</span>
          <span class="message-text">hey, how can i help?</span>
        </div>
      </div>`;
    return;
  }

  chat.messages.forEach((msg, i) => {
    const el = createMessageEl(msg, i);
    chatMessages.appendChild(el);
  });

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createMessageEl(msg, index) {
  const isBot = msg.sender === "bot";
  const div = document.createElement("div");
  div.className = `message ${isBot ? "bot-message" : "user-message"}`;
  div.dataset.index = index;

  let replyHtml = "";
  if (msg.replyTo !== undefined && msg.replyTo !== null) {
    const chat = chats[activeChatId];
    const refMsg = chat.messages[msg.replyTo];
    if (refMsg) {
      const refText = refMsg.text.length > 60 ? refMsg.text.slice(0, 60) + "..." : refMsg.text;
      replyHtml = `<div class="reply-ref" data-scroll-to="${msg.replyTo}">^ replying to [${refMsg.sender === "bot" ? "finn" : "you"}]: ${escapeHtml(refText)}</div>`;
    }
  }

  let thinkingHtml = "";
  if (msg.thinking) {
    thinkingHtml = `<div class="thinking-summary" onclick="this.classList.toggle('expanded')">[reasoning] ${escapeHtml(msg.thinking)}</div>`;
  }

  div.innerHTML = `
    ${replyHtml}
    <div class="message-row">
      <span class="msg-prefix">${isBot ? "[finn]" : "[you]"}</span>
      <span class="message-text">${thinkingHtml}${msg.image ? `<img class="message-image" src="${msg.image}" alt="uploaded image">` : ""}${msg.generatedImage ? `<img class="message-image generated-image" src="${msg.generatedImage}" alt="generated image">` : ""}${isBot ? renderMarkdown(msg.text) : escapeHtml(msg.text)}</span>
      <span class="message-actions"><button class="reply-btn" data-reply-index="${index}">reply</button></span>
    </div>
  `;

  // Reply button
  const replyBtn = div.querySelector(".reply-btn");
  replyBtn.addEventListener("click", () => setReply(index));

  // Click reply ref to scroll
  const refEl = div.querySelector(".reply-ref");
  if (refEl) {
    refEl.addEventListener("click", () => {
      const target = chatMessages.querySelector(`[data-index="${refEl.dataset.scrollTo}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.style.outline = "1px solid var(--green)";
        setTimeout(() => { target.style.outline = ""; }, 1500);
      }
    });
  }

  return div;
}

// ── Send ──
async function handleSend(e) {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text && !pendingImage) return;

  const chat = chats[activeChatId];
  const hasImage = !!pendingImage;
  const imageData = pendingImage;

  // Save user message (don't store full base64 in localStorage for large images — store a thumbnail)
  const userMsg = {
    sender: "user",
    text: text || "(image)",
    replyTo: replyingTo ? replyingTo.index : null,
    image: hasImage ? await resizeImage(imageData, 240) : null,
  };
  chat.messages.push(userMsg);

  // Build history entry for API
  if (hasImage) {
    const content = [
      { type: "image_url", image_url: { url: imageData } },
    ];
    if (text) content.push({ type: "text", text: replyingTo ? `[replying to: "${replyingTo.text}"]\n${text}` : text });
    else content.push({ type: "text", text: "Describe this image." });
    chat.history.push({ role: "user", content });
  } else {
    chat.history.push({ role: "user", content: replyingTo ? `[replying to: "${replyingTo.text}"]\n${text}` : text });
  }

  autoNameChat(text || "image chat");
  cancelReply();
  cancelImage();
  saveChats();
  renderMessages();

  chatInput.value = "";
  chatInput.style.height = "auto";
  sendBtn.disabled = true;

  // Check for image generation command
  const genMatch = text.match(/^\/(gen|image|draw|create)\s+(.+)/i);
  if (genMatch) {
    const prompt = genMatch[2].trim();
    const thinkingEl = showThinkingIndicator();
    try {
      thinkingEl.querySelector(".thinking-status").textContent = "generating image...";
      const imgUrl = await generateImage(prompt);
      thinkingEl.remove();
      const botMsg = { sender: "bot", text: `here's what i got for "${prompt}":`, generatedImage: imgUrl, replyTo: null };
      chat.messages.push(botMsg);
      chat.history.push({ role: "assistant", content: `[generated image: ${prompt}]` });
      saveChats();
      renderMessages();
    } catch (err) {
      thinkingEl.remove();
      const botMsg = { sender: "bot", text: `couldn't generate that: ${err.message}`, replyTo: null };
      chat.messages.push(botMsg);
      saveChats();
      renderMessages();
    }
    sendBtn.disabled = false;
    chatInput.focus();
    return;
  }

  const thinkingEl = showThinkingIndicator();

  try {
    const { thinking, reply } = await callGroq(chat.history, thinkingEl, 10, hasImage);
    thinkingEl.remove();

    const botMsg = { sender: "bot", text: reply, thinking: thinking || null, replyTo: null };
    chat.messages.push(botMsg);
    chat.history.push({ role: "assistant", content: reply });
    saveChats();
    renderMessages();
  } catch (err) {
    thinkingEl.remove();
    const botMsg = { sender: "bot", text: `error: ${err.message}`, replyTo: null };
    chat.messages.push(botMsg);
    saveChats();
    renderMessages();
  } finally {
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

async function callGroq(history, thinkingEl, contextSize = 10, useVision = false) {
  const personality = customPersonality || FALLBACK_PERSONALITY;

  // Trim history to fit token limits, keep last contextSize messages
  const trimmedHistory = history.slice(-contextSize).map(msg => {
    let content = msg.content;
    // If content is an array (image message), convert to string for text model
    if (Array.isArray(content)) {
      if (useVision) {
        return msg; // Keep array format for vision model
      }
      // Extract just the text parts for text-only model
      content = content
        .filter(c => c.type === "text")
        .map(c => c.text)
        .join("\n") || "(image)";
    }
    // Truncate very long messages to save tokens
    if (typeof content === "string" && content.length > 1500) {
      content = content.slice(0, 1500) + "...";
    }
    return { ...msg, content };
  });

  const messages = [
    { role: "system", content: personality + "\n\nIMPORTANT: Keep your internal thinking VERY brief (under 50 words). Spend most of your output on the actual response, not reasoning. Never use emojis." },
    ...trimmedHistory,
  ];

  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: useVision ? MODEL_VISION : MODEL_TEXT,
      messages,
      max_tokens: 4096,
      temperature: 0.9,
      stream: true,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    // If too many tokens, retry with less context
    if (res.status === 413 || (data.error?.message && data.error.message.includes("too large"))) {
      if (contextSize > 2) {
        return callGroq(history, thinkingEl, Math.max(2, Math.floor(contextSize / 2)), useVision);
      }
      // Last resort: just send the latest message
      return callGroq(history.slice(-1), thinkingEl, 1, useVision);
    }
    if (res.status === 429) throw new Error("rate limited — wait a sec and try again");
    throw new Error(data.error?.message || `api error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content || "";
        fullText += delta;

        // Live thinking preview
        const thinkMatch = fullText.match(/<think>([\s\S]*?)(<\/think>|$)/);
        if (thinkMatch && thinkingEl) {
          const thinkText = thinkMatch[1].trim();
          const thinkLines = thinkText.split("\n").filter(l => l.trim());
          const lastLine = thinkLines[thinkLines.length - 1] || "";
          const preview = lastLine.length > 60 ? lastLine.slice(0, 60) + "..." : lastLine;
          const statusEl = thinkingEl.querySelector(".thinking-status");
          if (statusEl) statusEl.textContent = preview;
        }
      } catch {}
    }
  }

  // Extract thinking
  let thinking = "";
  let reply = fullText;

  // Handle closed <think>...</think> blocks
  const thinkBlock = fullText.match(/<think>([\s\S]*?)<\/think>/);
  // Handle unclosed <think> blocks (model ran out of tokens while thinking)
  const unclosedThink = !thinkBlock && fullText.match(/<think>([\s\S]*?)$/);

  if (thinkBlock || unclosedThink) {
    const rawThinking = (thinkBlock ? thinkBlock[1] : unclosedThink[1]).trim();
    thinking = summarizeThinking(rawThinking);
  }

  reply = reply.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
  reply = reply.replace(/<think>[\s\S]*$/g, "").trim(); // unclosed think
  reply = reply.replace(/<\/?think>/g, "").trim();

  // Strip emojis
  reply = reply.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{200D}\u{20E3}\u{FE0F}]/gu, "").trim();

  // If reply is empty after stripping thinking, provide a fallback
  if (!reply) {
    reply = "(finn was thinking too hard and forgot to respond — try again)";
  }

  return { thinking, reply };
}

// ── Color ──
function applyColor(colorName) {
  const c = COLOR_PRESETS[colorName];
  if (!c) return;
  const root = document.documentElement;
  root.style.setProperty("--green", c.accent);
  root.style.setProperty("--green-dim", c.dim);
  root.style.setProperty("--green-dark", c.dark);
  root.style.setProperty("--text", c.accent);
  root.style.setProperty("--text-dim", c.dim);
  root.style.setProperty("--text-user", c.user);
  root.style.setProperty("--border", c.dark);
  colorBtns.forEach((b) => {
    b.classList.toggle("active", b.dataset.color === colorName);
  });
}

// ── UI Helpers ──
function showThinkingIndicator() {
  const msg = document.createElement("div");
  msg.className = "message bot-message thinking-message";
  msg.innerHTML = `
    <div class="message-row">
      <span class="msg-prefix">[finn]</span>
      <span class="message-text">
        <div class="thinking-live">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <span class="thinking-status"></span>
        </div>
      </span>
    </div>
  `;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msg;
}

// ── Image Generation (Pollinations.ai — free, no key) ──
async function generateImage(prompt) {
  const encoded = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=512&height=512&nologo=true&seed=${Date.now()}`;
  // Pre-fetch to trigger generation, then return the URL
  const res = await fetch(url);
  if (!res.ok) throw new Error("Image generation failed");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMarkdown(text) {
  let html = escapeHtml(text);
  // Headers: ###, ##, #
  html = html.replace(/^### (.+)$/gm, '<span class="md-h3">$1</span>');
  html = html.replace(/^## (.+)$/gm, '<span class="md-h2">$1</span>');
  html = html.replace(/^# (.+)$/gm, '<span class="md-h1">$1</span>');
  // Bold: **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code: `text`
  html = html.replace(/`(.+?)`/g, '<code class="md-code">$1</code>');
  return html;
}

function summarizeThinking(rawThinking) {
  // Get the key points from the reasoning — aim for 2-3 short sentences, max 200 chars
  const lines = rawThinking.split("\n").filter(l => l.trim().length > 10);
  // Try to grab the last few lines (usually the conclusion/decision)
  const conclusion = lines.slice(-4).join(" ");
  const sentences = conclusion.split(/[.!?]\s+/).filter(s => s.trim().length > 5);
  // Take last 2 sentences (the conclusion is usually at the end)
  let summary = sentences.slice(-2).join(". ").trim();
  if (summary.length > 200) summary = summary.slice(0, 200) + "...";
  if (summary && !summary.endsWith(".") && !summary.endsWith("...")) summary += ".";
  return summary || "thinking...";
}

// Resize image to save localStorage space
function resizeImage(dataUrl, maxSize) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > h) { if (w > maxSize) { h = h * maxSize / w; w = maxSize; } }
      else { if (h > maxSize) { w = w * maxSize / h; h = maxSize; } }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.src = dataUrl;
  });
}

// ── Call Mode (uses MediaRecorder + Groq Whisper for speech-to-text) ──
let callActive = false;
let callMuted = false;
let callHistory = [];
let micStream = null;
let mediaRecorder = null;
let audioChunks = [];
let silenceTimer = null;
let audioCtx = null;
let analyser = null;

function initCall() {
  const callBtn = document.getElementById("call-btn");
  const callOverlay = document.getElementById("call-overlay");
  const callEnd = document.getElementById("call-end");
  const callStatus = document.getElementById("call-status");
  const callTranscript = document.getElementById("call-transcript");

  const callMuteBtn = document.getElementById("call-mute");

  callBtn.addEventListener("click", startCall);
  callEnd.addEventListener("click", endCall);
  callMuteBtn.addEventListener("click", toggleMute);

  function toggleMute() {
    callMuted = !callMuted;
    callMuteBtn.textContent = callMuted ? "unmute" : "mute";
    callMuteBtn.classList.toggle("muted", callMuted);
    if (callMuted) {
      // Stop recording
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
      if (silenceTimer) clearTimeout(silenceTimer);
      callStatus.textContent = "muted";
      callStatus.className = "call-status";
      callTranscript.textContent = "mic is muted";
    } else {
      // Resume recording
      callStatus.textContent = "listening...";
      callStatus.className = "call-status listening";
      startRecording();
    }
  }

  async function startCall() {
    callOverlay.style.display = "flex";
    callStatus.textContent = "requesting mic...";
    callTranscript.textContent = "";

    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      callStatus.textContent = "mic denied";
      callTranscript.textContent = "Allow microphone in System Settings > Privacy & Security > Microphone for Electron";
      return;
    }

    callActive = true;
    callHistory = [];
    loadBestVoice();

    // Set up audio analysis for silence detection
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(micStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    callStatus.textContent = "listening...";
    callStatus.className = "call-status listening";
    callTranscript.textContent = "speak now...";

    startRecording();
  }

  function endCall() {
    callActive = false;
    callMuted = false;
    callMuteBtn.textContent = "mute";
    callMuteBtn.classList.remove("muted");
    window.speechSynthesis.cancel();
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
    if (silenceTimer) clearTimeout(silenceTimer);
    if (micStream) {
      micStream.getTracks().forEach(t => t.stop());
      micStream = null;
    }
    if (audioCtx) {
      audioCtx.close();
      audioCtx = null;
    }
    callOverlay.style.display = "none";
  }

  function startRecording() {
    if (!callActive || !micStream || callMuted) return;

    audioChunks = [];
    mediaRecorder = new MediaRecorder(micStream, { mimeType: "audio/webm" });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (!callActive) return;
      if (audioChunks.length === 0) {
        startRecording();
        return;
      }
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
      // Only transcribe if there's meaningful audio (> 1KB)
      if (audioBlob.size < 1000) {
        startRecording();
        return;
      }
      await transcribeAndRespond(audioBlob);
    };

    mediaRecorder.start();
    callStatus.textContent = "listening...";
    callStatus.className = "call-status listening";

    // Monitor audio levels to detect speech and silence
    monitorAudio();
  }

  let isSpeaking = false;
  let silenceStart = 0;

  function monitorAudio() {
    if (!callActive || !analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    let speechDetected = false;

    function check() {
      if (!callActive) return;
      if (!mediaRecorder || mediaRecorder.state === "inactive") return;

      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;

      // Show audio level
      const bars = Math.min(15, Math.floor(avg / 6));
      const levelBar = "█".repeat(bars) + "░".repeat(15 - bars);
      if (callStatus.textContent.includes("listening")) {
        callTranscript.textContent = `[${levelBar}] ${avg > 8 ? "hearing you..." : "waiting for speech..."}`;
      }

      if (avg > 8) {
        // Speech detected
        speechDetected = true;
        isSpeaking = true;
        silenceStart = 0;
      } else if (isSpeaking) {
        // Was speaking, now silent
        if (silenceStart === 0) {
          silenceStart = Date.now();
        } else if (Date.now() - silenceStart > 1500) {
          // 1.5 seconds of silence after speech — stop recording
          isSpeaking = false;
          silenceStart = 0;
          if (speechDetected && mediaRecorder && mediaRecorder.state === "recording") {
            callStatus.textContent = "processing...";
            callTranscript.textContent = "transcribing your speech...";
            mediaRecorder.stop();
            return; // Don't schedule another check
          }
        }
      }

      requestAnimationFrame(check);
    }

    // Reset state
    isSpeaking = false;
    silenceStart = 0;
    speechDetected = false;

    // Also set a max recording time of 15 seconds
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
      }
    }, 15000);

    check();
  }

  async function transcribeAndRespond(audioBlob) {
    if (!callActive) return;

    callStatus.textContent = "transcribing...";

    try {
      // Send to Groq Whisper API
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");
      formData.append("model", "whisper-large-v3");
      formData.append("language", "en");

      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `Whisper API error ${res.status}`);
      }

      const data = await res.json();
      const userText = data.text?.trim();

      if (!userText) {
        callTranscript.textContent = "didn't catch that — try again";
        callStatus.textContent = "listening...";
        callStatus.className = "call-status listening";
        startRecording();
        return;
      }

      // Got transcription — now get Finn's response
      callStatus.textContent = "finn is thinking...";
      callTranscript.textContent = `you: ${userText}`;

      callHistory.push({ role: "user", content: userText });

      const personality = customPersonality || FALLBACK_PERSONALITY;
      const messages = [
        { role: "system", content: personality + "\n\nYou are in a live voice call. RULES:\n1. Reply with ONLY your spoken response. No thinking, no reasoning, no internal monologue, no planning.\n2. Keep it short — 1-3 sentences.\n3. Be conversational, like talking on the phone.\n4. No markdown, no formatting, no lists.\n5. If someone asks for something long like an essay, say something like 'that's more of a text chat thing, send me a message and I'll write it out for you.'\n6. Never start with 'Okay, the user asked...' or any meta-commentary. Just respond naturally." },
        ...callHistory.slice(-10),
      ];

      // Use llama for calls — no <think> tags, faster for short responses
      const chatRes = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages,
          max_tokens: 200,
          temperature: 0.9,
        }),
      });

      if (!chatRes.ok) throw new Error("Chat API error");

      const chatData = await chatRes.json();
      let reply = chatData.choices[0].message.content;
      // Strip any thinking tags just in case
      reply = reply.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
      reply = reply.replace(/<think>[\s\S]*$/g, "").trim();
      reply = reply.replace(/<\/?think>/g, "").trim();
      // Strip any remaining xml-like tags
      reply = reply.replace(/<[^>]+>/g, "").trim();
      // Strip emojis
      reply = reply.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}\u{200D}\u{20E3}\u{FE0F}]/gu, "").trim();
      if (!reply) reply = "hmm, say that again?";

      callHistory.push({ role: "assistant", content: reply });
      callTranscript.textContent = reply;

      // Speak the reply
      callStatus.textContent = "finn is talking...";
      callStatus.className = "call-status speaking";
      await speakCallText(reply);

      // Listen again
      if (callActive) startRecording();

    } catch (err) {
      callTranscript.textContent = `error: ${err.message}`;
      if (callActive) {
        setTimeout(() => startRecording(), 1000);
      }
    }
  }
}

// ── Text-to-Speech ──
let bestVoice = null;

// ElevenLabs TTS (set key in config or leave empty to use system voice)
let elevenLabsKey = localStorage.getItem("finnbot_elevenlabs_key") || "sk_289931d5b9a3e56b0af6ab2434984ce391707f87b7acea3e";
let selectedVoiceId = localStorage.getItem("finnbot_voice_id") || "pNInz6obpgDQGcFmaJgB";

async function speakWithElevenLabs(text) {
  if (!elevenLabsKey) return false;
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": elevenLabsKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!res.ok) return false;
    const blob = await res.blob();
    const audio = new Audio(URL.createObjectURL(blob));
    return new Promise((resolve) => {
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play();
    });
  } catch {
    return false;
  }
}

function loadBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  // Prefer the most realistic voices on each platform
  const preferred = [
    // Mac enhanced voices (download in System Settings > Accessibility > Spoken Content)
    "Evan (Enhanced)", "Samantha (Enhanced)", "Tom (Enhanced)", "Ava (Enhanced)",
    "Zoe (Enhanced)", "Alex (Enhanced)",
    // Mac standard
    "Evan", "Samantha", "Tom", "Alex", "Ava", "Zoe",
    // Chrome/Android neural voices
    "Google UK English Male", "Google UK English Female",
    // Edge neural voices (Windows/mobile Edge)
    "Microsoft Guy Online", "Microsoft Aria Online",
    "Microsoft Ryan Online", "Microsoft Jenny Online",
    // iOS
    "Samantha", "Daniel",
    // Generic fallbacks
    "Karen", "Moira",
  ];

  for (const name of preferred) {
    const v = voices.find(v => v.name === name || v.name.includes(name));
    if (v) { bestVoice = v; return; }
  }

  const english = voices.filter(v => v.lang.startsWith("en"));
  bestVoice = english[0] || voices[0] || null;
}

// Load voices (they load async in some browsers)
window.speechSynthesis.onvoiceschanged = loadBestVoice;
loadBestVoice();

async function speakCallText(text) {
  // Try ElevenLabs first (most realistic)
  const spoke = await speakWithElevenLabs(text);
  if (spoke !== false) return;

  // Fall back to system voice
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) { resolve(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (bestVoice) utterance.voice = bestVoice;
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onend = resolve;
    utterance.onerror = resolve;
    window.speechSynthesis.speak(utterance);
  });
}

initCall();
init();
