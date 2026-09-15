/* 
LONER TECH NUMBER BOT v3.0
Premium OTP Service with Rich Messages
Bot API 10.3+
*/

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const express = require('express');

// ENVIRONMENT CONFIGURATION
const API1_URL = process.env.API1_URL || '';
const API1_TOKEN = process.env.API1_TOKEN || '';
const API2_URL = process.env.API2_URL || '';
const API2_TOKEN = process.env.API2_TOKEN || '';
const API3_URL = process.env.API3_URL || '';
const API3_KEY = process.env.API3_KEY || '';
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const TARGET_CHAT = process.env.TARGET_CHAT || '';
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/your_channel';
const NUMBER_BOT_URL = process.env.NUMBER_BOT_URL || 'https://t.me/your_bot';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(id => id.trim());
const PORT = process.env.PORT || 3000;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

// SMALL CAPS FONT CONVERTER
const smallCapsMap = {
    'a': 'ᴀ', 'b': 'ʙ', 'c': 'ᴄ', 'd': 'ᴅ', 'e': 'ᴇ', 'f': 'ғ', 'g': 'ɢ',
    'h': 'ʜ', 'i': 'ɪ', 'j': 'ᴊ', 'k': 'ᴋ', 'l': 'ʟ', 'm': 'ᴍ', 'n': 'ɴ',
    'o': 'ᴏ', 'p': 'ᴘ', 'q': 'ǫ', 'r': 'ʀ', 's': 's', 't': 'ᴛ', 'u': 'ᴜ',
    'v': 'ᴠ', 'w': 'ᴡ', 'x': 'x', 'y': 'ʏ', 'z': 'ᴢ',
    'A': 'ᴀ', 'B': 'ʙ', 'C': 'ᴄ', 'D': 'ᴅ', 'E': 'ᴇ', 'F': 'ғ', 'G': 'ɢ',
    'H': 'ʜ', 'I': 'ɪ', 'J': 'ᴊ', 'K': 'ᴋ', 'L': 'ʟ', 'M': 'ᴍ', 'N': 'ɴ',
    'O': 'ᴏ', 'P': 'ᴘ', 'Q': 'ǫ', 'R': 'ʀ', 'S': 's', 'T': 'ᴛ', 'U': 'ᴜ',
    'V': 'ᴠ', 'W': 'ᴡ', 'X': 'x', 'Y': 'ʏ', 'Z': 'ᴢ'
};

function smallCaps(text) {
    return String(text).split('').map(char => smallCapsMap[char] || char).join('');
}

// GLOBAL STATE
let rotatingNumbersCache = [];
let allNumbersCache = [];
let isBotActive = true;
let bannedUsers = new Set();
let numberSubscribers = new Map();
const seenIds = new Set();

const STATS_FILE = 'bot_stats.json';
let botStats = {
    totalOTPs: 0,
    totalNumbers: 0,
    activeUsers: new Set(),
    botUptime: Date.now(),
    lastOTP: null,
    apiCalls: 0,
    errors: 0
};

try {
    if (fs.existsSync(STATS_FILE)) {
        const statsData = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        botStats = { 
            ...botStats, 
            ...statsData, 
            activeUsers: new Set(statsData.activeUsers || []), 
            botUptime: statsData.botUptime || Date.now() 
        };
    }
} catch (e) {}

function saveStats() {
    try {
        const statsToSave = { ...botStats, activeUsers: Array.from(botStats.activeUsers) };
        fs.writeFileSync(STATS_FILE, JSON.stringify(statsToSave, null, 2));
    } catch (e) {}
}

// COMPACT COUNTRY DATABASE
const countryDb = {
    "1":"USA","7":"Russia","20":"Egypt","27":"South Africa","30":"Greece",
    "31":"Netherlands","32":"Belgium","33":"France","34":"Spain","39":"Italy",
    "40":"Romania","41":"Switzerland","43":"Austria","44":"UK","45":"Denmark",
    "46":"Sweden","47":"Norway","48":"Poland","49":"Germany","51":"Peru",
    "52":"Mexico","54":"Argentina","55":"Brazil","56":"Chile","57":"Colombia",
    "60":"Malaysia","61":"Australia","62":"Indonesia","63":"Philippines",
    "64":"New Zealand","65":"Singapore","66":"Thailand","81":"Japan",
    "82":"South Korea","84":"Vietnam","86":"China","90":"Turkey","91":"India",
    "92":"Pakistan","94":"Sri Lanka","234":"Nigeria","254":"Kenya",
    "255":"Tanzania","256":"Uganda","351":"Portugal","353":"Ireland",
    "354":"Iceland","358":"Finland","380":"Ukraine"
};

function getCountry(number) {
    let d = String(number).replace("+", "").replace(/\s/g, "");
    for (let l = 4; l >= 1; l--) {
        let prefix = d.substring(0, l);
        if (countryDb[prefix]) return countryDb[prefix];
    }
    return "Global";
}

// HELPER FUNCTIONS
function extractCode(msg) {
    const match = String(msg).match(/\b\d{3}[-\s]\d{3}\b|\b\d{4,8}\b/);
    return match ? match[0] : "N/A";
}

function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function detectService(message) {
    const msg = String(message).toLowerCase();
    const services = {
        'whatsapp': 'WhatsApp', 'wa.me': 'WhatsApp',
        'facebook': 'Facebook', 'fb': 'Facebook',
        'telegram': 'Telegram', 'tg': 'Telegram',
        'instagram': 'Instagram', 'ig': 'Instagram',
        'google': 'Google', 'gmail': 'Google',
        'apple': 'Apple', 'icloud': 'Apple',
        'microsoft': 'Microsoft', 'outlook': 'Microsoft',
        'amazon': 'Amazon', 'paypal': 'PayPal',
        'uber': 'Uber', 'tiktok': 'TikTok',
        'snapchat': 'Snapchat', 'twitter': 'Twitter/X',
        'discord': 'Discord', 'spotify': 'Spotify',
        'netflix': 'Netflix'
    };
    for (const [key, value] of Object.entries(services)) {
        if (msg.includes(key)) return value;
    }
    return 'Unknown Service';
}

// ═══════════════════════════════════════════════════════════
//  📨 RICH MESSAGE BUILDERS (Bot API 10.3)
// ═══════════════════════════════════════════════════════════

function buildRichTable(title, rows) {
    const tableRows = rows.map(([label, value]) => [
        { text: smallCaps(label), type: 'bold' },
        { text: String(value) }
    ]);
    
    return {
        type: 'table',
        title: smallCaps(title),
        rows: tableRows,
        is_compact: true
    };
}

function buildRichParagraph(text) {
    return {
        type: 'paragraph',
        text: smallCaps(text)
    };
}

function buildRichHeading(text, level = 1) {
    return {
        type: 'heading',
        level: level,
        text: smallCaps(text)
    };
}

function buildRichQuote(text, expandable = false) {
    return {
        type: 'quote',
        text: smallCaps(text),
        expandable: expandable
    };
}

function buildRichButtons(buttons) {
    return {
        type: 'buttons',
        buttons: buttons.map(btn => ({
            type: 'callback',
            text: smallCaps(btn.text),
            callback_data: btn.callback_data
        }))
    };
}

function buildRichUrlButton(text, url) {
    return {
        type: 'buttons',
        buttons: [{
            type: 'url',
            text: smallCaps(text),
            url: url
        }]
    };
}

// SEND RICH MESSAGE
async function sendRichMessage(chatId, blocks, options = {}) {
    try {
        const payload = {
            chat_id: chatId,
            rich_message: {
                blocks: blocks
            },
            disable_web_page_preview: true
        };
        
        if (options.replyTo) {
            payload.reply_to_message_id = options.replyTo;
        }
        
        const response = await axios.post(`${API_BASE}/sendRichMessage`, payload);
        return response.data;
    } catch (error) {
        console.error('Rich message error:', error.response?.data || error.message);
        // Fallback to regular message
        return await sendFallbackMessage(chatId, blocks, options);
    }
}

// FALLBACK TO REGULAR MESSAGE
async function sendFallbackMessage(chatId, blocks, options = {}) {
    let text = '';
    let keyboard = null;
    
    for (const block of blocks) {
        if (block.type === 'heading') {
            text += `<b>${escapeHtml(block.text)}</b>\n\n`;
        } else if (block.type === 'paragraph') {
            text += `${escapeHtml(block.text)}\n\n`;
        } else if (block.type === 'table') {
            text += `<b>${escapeHtml(block.title)}</b>\n`;
            text += `<pre>`;
            for (const row of block.rows) {
                const label = row[0].text;
                const value = row[1].text;
                text += `${label.padEnd(15)} │ ${value}\n`;
            }
            text += `</pre>\n\n`;
        } else if (block.type === 'quote') {
            text += `<blockquote>${escapeHtml(block.text)}</blockquote>\n\n`;
        } else if (block.type === 'buttons') {
            keyboard = {
                inline_keyboard: [block.buttons.map(btn => ({
                    text: btn.text,
                    callback_data: btn.callback_data || btn.url
                }))]
            };
        }
    }
    
    const payload = {
        chat_id: chatId,
        text: text.trim(),
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };
    
    if (keyboard) {
        payload.reply_markup = keyboard;
    }
    
    const response = await axios.post(`${API_BASE}/sendMessage`, payload);
    return response.data;
}

// EDIT RICH MESSAGE
async function editRichMessage(chatId, messageId, blocks) {
    try {
        const payload = {
            chat_id: chatId,
            message_id: messageId,
            rich_message: {
                blocks: blocks
            }
        };
        
        const response = await axios.post(`${API_BASE}/editMessageText`, payload);
        return response.data;
    } catch (error) {
        console.error('Edit rich message error:', error.response?.data || error.message);
        return await editFallbackMessage(chatId, messageId, blocks);
    }
}

async function editFallbackMessage(chatId, messageId, blocks) {
    let text = '';
    let keyboard = null;
    
    for (const block of blocks) {
        if (block.type === 'heading') {
            text += `<b>${escapeHtml(block.text)}</b>\n\n`;
        } else if (block.type === 'paragraph') {
            text += `${escapeHtml(block.text)}\n\n`;
        } else if (block.type === 'table') {
            text += `<b>${escapeHtml(block.title)}</b>\n`;
            text += `<pre>`;
            for (const row of block.rows) {
                const label = row[0].text;
                const value = row[1].text;
                text += `${label.padEnd(15)} │ ${value}\n`;
            }
            text += `</pre>\n\n`;
        } else if (block.type === 'quote') {
            text += `<blockquote>${escapeHtml(block.text)}</blockquote>\n\n`;
        } else if (block.type === 'buttons') {
            keyboard = {
                inline_keyboard: [block.buttons.map(btn => ({
                    text: btn.text,
                    callback_data: btn.callback_data || btn.url
                }))]
            };
        }
    }
    
    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: text.trim(),
        parse_mode: 'HTML'
    };
    
    if (keyboard) {
        payload.reply_markup = keyboard;
    }
    
    const response = await axios.post(`${API_BASE}/editMessageText`, payload);
    return response.data;
}

// ANSWER CALLBACK QUERY
async function answerCallback(callbackQueryId, text, showAlert = false) {
    try {
        await axios.post(`${API_BASE}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text: smallCaps(text),
            show_alert: showAlert
        });
    } catch (e) {}
}

// ═══════════════════════════════════════════════════════════
//  🔌 API FETCH FUNCTIONS
// ═══════════════════════════════════════════════════════════

async function fetchTokenApi(url, token, lastTs) {
    try {
        botStats.apiCalls++;
        const response = await axios.get(url, {
            params: { token: token },
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 6000
        });
        const data = response.data;
        if (!Array.isArray(data) || data.length === 0) return lastTs;

        if (!lastTs) {
            console.log(`API Init: ${data[0][3]}`);
            return String(data[0][3]);
        }

        for (let i = data.length - 1; i >= 0; i--) {
            const row = data[i];
            if (row && String(row[3]) > lastTs) {
                await sendSms(String(row[0] || "Unknown"), String(row[1] || ""), String(row[2] || ""), String(row[3] || ""));
            }
        }
        saveStats();
        return String(data[0][3]);
    } catch (err) {
        botStats.errors++;
        saveStats();
        return lastTs;
    }
}

async function fetchPscallApi(lastTs) {
    try {
        botStats.apiCalls++;
        const response = await axios.get(API3_URL, {
            params: { key: API3_KEY, start: 0, length: 30 },
            headers: { "User-Agent": "Mozilla/5.0" },
            timeout: 6000
        });
        const data = response.data;
        if (!data || data.result !== "success" || !Array.isArray(data.data) || data.data.length === 0) return lastTs;

        const items = data.data;
        if (!lastTs) {
            console.log(`API Init: ${items[0].dateadded}`);
            return String(items[0].dateadded);
        }

        for (let i = items.length - 1; i >= 0; i--) {
            const item = items[i];
            if (item && String(item.dateadded) > lastTs) {
                await sendSms(String(item.cli || "Unknown"), String(item.num || ""), String(item.sms || ""), String(item.dateadded || ""));
            }
        }
        saveStats();
        return String(items[0].dateadded);
    } catch (err) {
        botStats.errors++;
        saveStats();
        return lastTs;
    }
}

async function fetchAllNumbers() {
    try {
        const allNumbers = new Set();
        allNumbersCache.forEach(num => allNumbers.add(num));
        rotatingNumbersCache.forEach(num => allNumbers.add(num));
        botStats.totalNumbers = allNumbers.size;
        saveStats();
        return [...allNumbers];
    } catch (err) {
        return allNumbersCache.length > 0 ? allNumbersCache : rotatingNumbersCache;
    }
}

// ═══════════════════════════════════════════════════════════
//  📨 SEND SMS ALERT WITH RICH MESSAGE
// ═══════════════════════════════════════════════════════════

async function sendSms(service, number, message, date) {
    try {
        if (!isBotActive) return;
        const uid = `${date}|${number}|${message.substring(0, 30)}`;
        if (seenIds.has(uid)) return;
        seenIds.add(uid);

        const cleanNum = String(number).trim();
        if (cleanNum.replace(/\D/g, '').length >= 7) {
            if (!rotatingNumbersCache.includes(cleanNum)) {
                rotatingNumbersCache.unshift(cleanNum);
                if (rotatingNumbersCache.length > 60) rotatingNumbersCache.pop();
            }
            if (!allNumbersCache.includes(cleanNum)) {
                allNumbersCache.push(cleanNum);
                if (allNumbersCache.length > 500) allNumbersCache = allNumbersCache.slice(-500);
            }
            botStats.totalOTPs++;
            botStats.totalNumbers = allNumbersCache.length;
            botStats.lastOTP = date;
            saveStats();
        }

        const country = getCountry(number);
        const code = extractCode(message);
        const detectedService = detectService(message);
        const clean = String(number).replace("+", "");
        const masked = clean.length > 7 ? clean.substring(0, 6) + "****" + clean.slice(-3) : clean;

        // Build rich message blocks
        const blocks = [
            buildRichHeading('NEW OTP ALERT'),
            buildRichTable('OTP DETAILS', [
                ['Country', country],
                ['Number', masked],
                ['Service', service],
                ['Detected', detectedService],
                ['Code', code],
                ['Time', new Date().toLocaleString()]
            ]),
            buildRichQuote(message.length > 100 ? message.substring(0, 100) + '...' : message),
            buildRichButtons([
                { text: 'GET NUMBER', callback_data: 'get_number' }
            ])
        ];

        await sendRichMessage(TARGET_CHAT, blocks);

        // Send to subscribers
        const subscribers = numberSubscribers.get(cleanNum);
        if (subscribers && subscribers.size > 0) {
            const subBlocks = [
                buildRichHeading('OTP RECEIVED'),
                buildRichTable('DETAILS', [
                    ['Number', cleanNum],
                    ['Code', code],
                    ['Service', detectedService]
                ]),
                buildRichQuote(message.length > 100 ? message.substring(0, 100) + '...' : message)
            ];

            for (const uid of subscribers) {
                try {
                    await sendRichMessage(uid, subBlocks);
                } catch (e) {
                    if (e.response && e.response.statusCode === 403) {
                        subscribers.delete(uid);
                        if (subscribers.size === 0) numberSubscribers.delete(cleanNum);
                    }
                }
            }
        }
        console.log(`OTP: ${service} | ${masked} | Subs: ${subscribers ? subscribers.size : 0}`);
    } catch (err) {
        console.error(`sendSms Error: ${err.message}`);
    }
}

// ═══════════════════════════════════════════════════════════
//  🏠 COMMAND HANDLERS WITH RICH MESSAGES
// ═══════════════════════════════════════════════════════════

async function handleStart(msg) {
    const userId = String(msg.from.id);
    const chatId = msg.chat.id;
    
    if (bannedUsers.has(userId)) {
        return sendRichMessage(chatId, [
            buildRichHeading('ACCESS DENIED'),
            buildRichParagraph('You are banned from using this bot.')
        ]);
    }
    
    botStats.activeUsers.add(userId);
    saveStats();

    const blocks = [
        buildRichHeading('LONER TECH NUMBER BOT'),
        buildRichTable('BOT INFO', [
            ['Version', '3.0 Premium'],
            ['Status', 'Online'],
            ['Service', 'Virtual Numbers'],
            ['Support', '200+ Countries']
        ]),
        buildRichParagraph('Welcome to the ultimate virtual number service! Get started by clicking the buttons below:'),
        buildRichButtons([
            { text: 'GET NUMBER', callback_data: 'get_number' }
        ]),
        buildRichUrlButton('OTP GROUP', CHANNEL_URL),
        buildRichUrlButton('CONTACT', 'https://t.me/your_contact')
    ];

    await sendRichMessage(chatId, blocks);
}

async function handleGetAll(msg) {
    const userId = String(msg.from.id);
    if (!ADMIN_IDS.includes(userId)) {
        return sendRichMessage(msg.chat.id, [
            buildRichHeading('ACCESS DENIED'),
            buildRichParagraph('Admin only command.')
        ]);
    }
    
    const chatId = msg.chat.id;
    const loadingBlocks = [
        buildRichParagraph('Fetching all numbers...')
    ];
    const loadingMsg = await sendRichMessage(chatId, loadingBlocks);
    
    try {
        const allNumbers = await fetchAllNumbers();
        if (allNumbers.length === 0) {
            return editRichMessage(chatId, loadingMsg.result.message_id, [
                buildRichHeading('NO NUMBERS'),
                buildRichParagraph('No numbers found in cache.')
            ]);
        }
        
        const displayNumbers = allNumbers.slice(0, 50);
        const numberRows = displayNumbers.map((num, i) => [`#${i + 1}`, num]);
        
        const blocks = [
            buildRichHeading('ALL AVAILABLE NUMBERS'),
            buildRichTable('SUMMARY', [
                ['Total', `${allNumbers.length} numbers`],
                ['Showing', `${displayNumbers.length} numbers`],
                ['Updated', new Date().toLocaleString()]
            ]),
            buildRichTable('NUMBERS', numberRows)
        ];

        await editRichMessage(chatId, loadingMsg.result.message_id, blocks);
    } catch (err) {
        await editRichMessage(chatId, loadingMsg.result.message_id, [
            buildRichHeading('ERROR'),
            buildRichParagraph(`Error: ${err.message}`)
        ]);
    }
}

async function handleMySubs(msg) {
    const userId = String(msg.from.id);
    const chatId = msg.chat.id;
    
    let subs = [];
    for (const [num, set] of numberSubscribers) {
        if (set.has(userId)) subs.push(num);
    }
    
    if (subs.length === 0) {
        return sendRichMessage(chatId, [
            buildRichHeading('NO SUBSCRIPTIONS'),
            buildRichParagraph('You are not subscribed to any number. Use GET NUMBER to subscribe.')
        ]);
    }
    
    const subRows = subs.map((num, i) => [`#${i + 1}`, num]);
    
    const blocks = [
        buildRichHeading('YOUR SUBSCRIPTIONS'),
        buildRichTable('SUBSCRIPTIONS', subRows),
        buildRichParagraph('Use /unsubscribe to stop receiving OTPs.')
    ];
    
    await sendRichMessage(chatId, blocks);
}

async function handleUnsubscribe(msg, match) {
    const userId = String(msg.from.id);
    const num = match[1].trim();
    const subs = numberSubscribers.get(num);
    
    if (subs && subs.has(userId)) {
        subs.delete(userId);
        if (subs.size === 0) numberSubscribers.delete(num);
        await sendRichMessage(msg.chat.id, [
            buildRichHeading('UNSUBSCRIBED'),
            buildRichTable('DETAILS', [
                ['Number', num],
                ['Status', 'Removed']
            ])
        ]);
    } else {
        await sendRichMessage(msg.chat.id, [
            buildRichHeading('NOT SUBSCRIBED'),
            buildRichParagraph(`You are not subscribed to ${num}`)
        ]);
    }
}

async function handleStats(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    
    const uptime = Math.floor((Date.now() - botStats.botUptime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    
    const blocks = [
        buildRichHeading('BOT STATISTICS'),
        buildRichTable('STATS', [
            ['Status', isBotActive ? 'Active' : 'Paused'],
            ['Uptime', `${hours}h ${minutes}m`],
            ['Total OTPs', botStats.totalOTPs],
            ['Total Numbers', botStats.totalNumbers],
            ['Active Users', botStats.activeUsers.size],
            ['API Calls', botStats.apiCalls],
            ['Errors', botStats.errors],
            ['Banned', bannedUsers.size]
        ])
    ];
    
    await sendRichMessage(msg.chat.id, blocks);
}

async function handlePause(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    isBotActive = false;
    await sendRichMessage(msg.chat.id, [
        buildRichHeading('BOT PAUSED'),
        buildRichParagraph('Bot has been paused. Use /resume to continue.')
    ]);
}

async function handleResume(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    isBotActive = true;
    await sendRichMessage(msg.chat.id, [
        buildRichHeading('BOT RESUMED'),
        buildRichParagraph('Bot is now active.')
    ]);
}

async function handleBan(msg, match) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    const targetId = match[1];
    bannedUsers.add(targetId);
    botStats.activeUsers.delete(targetId);
    for (const [num, subs] of numberSubscribers) {
        subs.delete(targetId);
        if (subs.size === 0) numberSubscribers.delete(num);
    }
    saveStats();
    
    await sendRichMessage(msg.chat.id, [
        buildRichHeading('USER BANNED'),
        buildRichTable('DETAILS', [
            ['User ID', targetId],
            ['Status', 'Banned']
        ])
    ]);
}

async function handleUnban(msg, match) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    const targetId = match[1];
    bannedUsers.delete(targetId);
    saveStats();
    
    await sendRichMessage(msg.chat.id, [
        buildRichHeading('USER UNBANNED'),
        buildRichTable('DETAILS', [
            ['User ID', targetId],
            ['Status', 'Unbanned']
        ])
    ]);
}

async function handleClearCache(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    rotatingNumbersCache = [];
    allNumbersCache = [];
    seenIds.clear();
    botStats.totalOTPs = 0;
    saveStats();
    
    await sendRichMessage(msg.chat.id, [
        buildRichHeading('CACHE CLEARED'),
        buildRichParagraph('All caches have been cleared.')
    ]);
}

async function handleBanned(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    
    if (bannedUsers.size === 0) {
        return sendRichMessage(msg.chat.id, [
            buildRichHeading('NO BANNED USERS'),
            buildRichParagraph('The ban list is empty.')
        ]);
    }
    
    const bannedRows = [...bannedUsers].map((id, i) => [`#${i + 1}`, id]);
    
    await sendRichMessage(msg.chat.id, [
        buildRichHeading('BANNED USERS'),
        buildRichTable('BAN LIST', bannedRows)
    ]);
}

async function handleAdmin(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) {
        return sendRichMessage(msg.chat.id, [
            buildRichHeading('ACCESS DENIED'),
            buildRichParagraph('Admin only command.')
        ]);
    }
    
    const blocks = [
        buildRichHeading('ADMIN CONTROL PANEL'),
        buildRichTable('STATUS', [
            ['Bot Status', isBotActive ? 'Active' : 'Paused'],
            ['Version', '3.0 Premium']
        ]),
        buildRichParagraph('Select an action:'),
        buildRichButtons([
            { text: 'STATISTICS', callback_data: 'admin_stats' },
            { text: 'PAUSE BOT', callback_data: 'admin_pause' }
        ]),
        buildRichButtons([
            { text: 'RESUME BOT', callback_data: 'admin_resume' },
            { text: 'CLEAR CACHE', callback_data: 'admin_clear' }
        ]),
        buildRichButtons([
            { text: 'BANNED USERS', callback_data: 'admin_banned' }
        ])
    ];

    await sendRichMessage(msg.chat.id, blocks);
}

async function handleBroadcast(msg, match) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    const messageToBroadcast = match[1];
    
    const sentMsg = await sendRichMessage(msg.chat.id, [
        buildRichHeading('BROADCASTING'),
        buildRichTable('INFO', [
            ['Message', messageToBroadcast.substring(0, 50) + '...'],
            ['Target', `${botStats.activeUsers.size} users`]
        ])
    ]);
    
    let success = 0, fail = 0;
    for (const uid of botStats.activeUsers) {
        try {
            await sendRichMessage(uid, [
                buildRichParagraph(messageToBroadcast)
            ]);
            success++;
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (e) { fail++; }
    }
    
    await editRichMessage(msg.chat.id, sentMsg.result.message_id, [
        buildRichHeading('BROADCAST COMPLETE'),
        buildRichTable('RESULTS', [
            ['Success', success],
            ['Failed', fail]
        ])
    ]);
}

// ═══════════════════════════════════════════════════════════
//  🎯 CALLBACK QUERY HANDLER
// ═══════════════════════════════════════════════════════════

async function handleCallbackQuery(callbackQuery) {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const data = callbackQuery.data;

    if (bannedUsers.has(userId)) {
        await answerCallback(callbackQuery.id, 'You are banned!', true);
        return;
    }

    // GET NUMBER - Show service selection
    if (data === "get_number") {
        await answerCallback(callbackQuery.id, 'Select a service', true);
        
        const blocks = [
            buildRichHeading('SELECT SERVICE'),
            buildRichTable('SERVICES', [
                ['WhatsApp', 'Works perfect'],
                ['Facebook', 'High success'],
                ['Telegram', 'Very reliable'],
                ['Instagram', 'Good working'],
                ['Google', 'Works fine'],
                ['Apple', 'Quality numbers']
            ]),
            buildRichParagraph('Choose a service for your number:'),
            buildRichButtons([
                { text: 'WHATSAPP', callback_data: 'service_whatsapp' },
                { text: 'FACEBOOK', callback_data: 'service_facebook' }
            ]),
            buildRichButtons([
                { text: 'TELEGRAM', callback_data: 'service_telegram' },
                { text: 'INSTAGRAM', callback_data: 'service_instagram' }
            ]),
            buildRichButtons([
                { text: 'GOOGLE', callback_data: 'service_google' },
                { text: 'APPLE', callback_data: 'service_apple' }
            ]),
            buildRichButtons([
                { text: 'RANDOM', callback_data: 'service_random' }
            ])
        ];

        await sendRichMessage(chatId, blocks);
        return;
    }

    // SERVICE SELECTED - Show numbers
    if (data && data.startsWith('service_')) {
        const serviceType = data.replace('service_', '');
        await answerCallback(callbackQuery.id, `Selected: ${serviceType}`, true);

        const loadingMsg = await sendRichMessage(chatId, [
            buildRichParagraph(`Fetching ${serviceType} numbers...`)
        ]);

        try {
            let allNumbers = await fetchAllNumbers();
            if (allNumbers.length === 0) {
                return editRichMessage(chatId, loadingMsg.result.message_id, [
                    buildRichHeading('NO NUMBERS'),
                    buildRichParagraph('No numbers available yet. Please wait for OTPs to arrive.')
                ]);
            }

            const randomNumbers = allNumbers.sort(() => 0.5 - Math.random()).slice(0, 5);

            const serviceNames = {
                whatsapp: "WhatsApp", facebook: "Facebook", telegram: "Telegram",
                instagram: "Instagram", google: "Google", apple: "Apple", random: "Random"
            };
            const name = serviceNames[serviceType] || serviceType;

            const numberRows = randomNumbers.map((num, i) => [`#${i + 1}`, num]);
            
            const buttonBlocks = randomNumbers.map(num => 
                buildRichButtons([{ text: `SUBSCRIBE: ${num}`, callback_data: `subscribe_${num}` }])
            );

            const blocks = [
                buildRichHeading('AVAILABLE NUMBERS'),
                buildRichTable('INFO', [
                    ['Service', name],
                    ['Found', `${randomNumbers.length} numbers`]
                ]),
                buildRichTable('NUMBERS', numberRows),
                buildRichParagraph('Click a number to subscribe:'),
                ...buttonBlocks
            ];

            await editRichMessage(chatId, loadingMsg.result.message_id, blocks);
        } catch (err) {
            await editRichMessage(chatId, loadingMsg.result.message_id, [
                buildRichHeading('ERROR'),
                buildRichParagraph(`Error: ${err.message}`)
            ]);
        }
        return;
    }

    // SUBSCRIBE TO NUMBER
    if (data && data.startsWith('subscribe_')) {
        const number = data.replace('subscribe_', '');
        await answerCallback(callbackQuery.id, `Subscribed to ${number}`, true);

        if (!numberSubscribers.has(number)) {
            numberSubscribers.set(number, new Set());
        }
        numberSubscribers.get(number).add(userId);

        const blocks = [
            buildRichHeading('SUBSCRIBED'),
            buildRichTable('DETAILS', [
                ['Number', number],
                ['Status', 'Active']
            ]),
            buildRichParagraph('You will now receive OTPs for this number.'),
            buildRichParagraph('Use /mysubs to see all your subscriptions.')
        ];

        await sendRichMessage(chatId, blocks);
        return;
    }

    // ADMIN CALLBACKS
    if (data === "admin_stats") {
        await answerCallback(callbackQuery.id, 'Loading stats...', true);
        const uptime = Math.floor((Date.now() - botStats.botUptime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        
        const blocks = [
            buildRichHeading('BOT STATISTICS'),
            buildRichTable('STATS', [
                ['Status', isBotActive ? 'Active' : 'Paused'],
                ['Uptime', `${hours}h ${minutes}m`],
                ['Total OTPs', botStats.totalOTPs],
                ['Total Numbers', botStats.totalNumbers],
                ['Active Users', botStats.activeUsers.size],
                ['API Calls', botStats.apiCalls],
                ['Errors', botStats.errors]
            ])
        ];
        
        await sendRichMessage(chatId, blocks);
    }

    if (data === "admin_pause") {
        await answerCallback(callbackQuery.id, 'Bot paused', true);
        isBotActive = false;
        await sendRichMessage(chatId, [
            buildRichHeading('BOT PAUSED'),
            buildRichParagraph('Bot has been paused.')
        ]);
    }

    if (data === "admin_resume") {
        await answerCallback(callbackQuery.id, 'Bot resumed', true);
        isBotActive = true;
        await sendRichMessage(chatId, [
            buildRichHeading('BOT RESUMED'),
            buildRichParagraph('Bot is now active.')
        ]);
    }

    if (data === "admin_clear") {
        await answerCallback(callbackQuery.id, 'Cache cleared', true);
        rotatingNumbersCache = [];
        allNumbersCache = [];
        seenIds.clear();
        botStats.totalOTPs = 0;
        saveStats();
        await sendRichMessage(chatId, [
            buildRichHeading('CACHE CLEARED'),
            buildRichParagraph('All caches have been cleared.')
        ]);
    }

    if (data === "admin_banned") {
        await answerCallback(callbackQuery.id, 'Loading banned users...', true);
        if (bannedUsers.size === 0) {
            return sendRichMessage(chatId, [
                buildRichHeading('NO BANNED USERS'),
                buildRichParagraph('The ban list is empty.')
            ]);
        }
        
        const bannedRows = [...bannedUsers].map((id, i) => [`#${i + 1}`, id]);
        
        await sendRichMessage(chatId, [
            buildRichHeading('BANNED USERS'),
            buildRichTable('BAN LIST', bannedRows)
        ]);
    }
}

// ═══════════════════════════════════════════════════════════
//  🔄 POLLING SETUP
// ═══════════════════════════════════════════════════════════

let offset = 0;

async function pollUpdates() {
    try {
        const response = await axios.get(`${API_BASE}/getUpdates`, {
            params: {
                offset: offset,
                timeout: 30
            }
        });
        
        const updates = response.data.result;
        
        for (const update of updates) {
            offset = update.update_id + 1;
            
            // Handle messages
            if (update.message) {
                const msg = update.message;
                const text = msg.text || '';
                
                if (text.startsWith('/start')) {
                    await handleStart(msg);
                } else if (text.startsWith('/getall')) {
                    await handleGetAll(msg);
                } else if (text.startsWith('/mysubs')) {
                    await handleMySubs(msg);
                } else if (text.startsWith('/unsubscribe')) {
                    const match = text.match(/\/unsubscribe (.+)/);
                    if (match) await handleUnsubscribe(msg, match);
                } else if (text.startsWith('/stats')) {
                    await handleStats(msg);
                } else if (text.startsWith('/pause')) {
                    await handlePause(msg);
                } else if (text.startsWith('/resume')) {
                    await handleResume(msg);
                } else if (text.startsWith('/ban')) {
                    const match = text.match(/\/ban (\d+)/);
                    if (match) await handleBan(msg, match);
                } else if (text.startsWith('/unban')) {
                    const match = text.match(/\/unban (\d+)/);
                    if (match) await handleUnban(msg, match);
                } else if (text.startsWith('/clearcache')) {
                    await handleClearCache(msg);
                } else if (text.startsWith('/banned')) {
                    await handleBanned(msg);
                } else if (text.startsWith('/admin')) {
                    await handleAdmin(msg);
                } else if (text.startsWith('/broadcast')) {
                    const match = text.match(/\/broadcast (.+)/);
                    if (match) await handleBroadcast(msg, match);
                }
            }
            
            // Handle callback queries
            if (update.callback_query) {
                await handleCallbackQuery(update.callback_query);
            }
        }
    } catch (error) {
        console.error('Polling error:', error.message);
    }
    
    setTimeout(pollUpdates, 1000);
}

// ═══════════════════════════════════════════════════════════
//  🏥 HEALTH CHECK SERVER
// ═══════════════════════════════════════════════════════════

const app = express();

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        bot: 'Loner Tech Number Bot',
        version: '3.0.0',
        api_version: '10.3',
        uptime: Math.floor((Date.now() - botStats.botUptime) / 1000),
        active: isBotActive,
        totalOTPs: botStats.totalOTPs,
        totalNumbers: botStats.totalNumbers,
        activeUsers: botStats.activeUsers.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.status(200).send('Loner Tech Number Bot is running with Rich Messages!');
});

app.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════
//  🔄 MAIN LOOP
// ═══════════════════════════════════════════════════════════

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function mainLoop() {
    console.log(`Loner Tech Number Bot v3.0 Started`);
    console.log(`Rich Messages Enabled (Bot API 10.3)`);
    console.log(`24/7 OTP Monitoring Active`);
    
    // Start polling
    pollUpdates();
    
    let ts1 = null, ts2 = null, ts3 = null;
    while (true) {
        try {
            ts1 = await fetchTokenApi(API1_URL, API1_TOKEN, ts1);
            ts2 = await fetchTokenApi(API2_URL, API2_TOKEN, ts2);
            ts3 = await fetchPscallApi(ts3);
        } catch (e) {
            console.log("Loop error:", e.message);
        }
        await sleep(3000);
    }
}

process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

mainLoop().catch(console.error);
