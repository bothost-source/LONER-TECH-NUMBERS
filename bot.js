
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
const BOT_USERNAME = process.env.BOT_USERNAME || 'your_bot_username';
const TARGET_CHAT = process.env.TARGET_CHAT || '';
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://t.me/your_channel';
const CONTACT_URL = process.env.CONTACT_URL || 'https://t.me/your_contact';
const FORCE_JOIN_CHANNEL_1 = process.env.FORCE_JOIN_CHANNEL_1 || '';
const FORCE_JOIN_CHANNEL_2 = process.env.FORCE_JOIN_CHANNEL_2 || '';
const FORCE_JOIN_CHANNEL_1_ID = process.env.FORCE_JOIN_CHANNEL_1_ID || '';
const FORCE_JOIN_CHANNEL_2_ID = process.env.FORCE_JOIN_CHANNEL_2_ID || '';
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

// CHECK IF USER IS MEMBER OF REQUIRED CHANNELS
async function checkForceJoin(userId) {
    // If no channels configured, allow access
    if (!FORCE_JOIN_CHANNEL_1_ID && !FORCE_JOIN_CHANNEL_2_ID) {
        return { joined: true, missing: [] };
    }

    const missing = [];

    // Check channel 1
    if (FORCE_JOIN_CHANNEL_1_ID) {
        try {
            const response = await axios.post(`${API_BASE}/getChatMember`, {
                chat_id: FORCE_JOIN_CHANNEL_1_ID,
                user_id: userId
            });
            const status = response.data.result?.status;
            if (!['member', 'administrator', 'creator'].includes(status)) {
                missing.push({
                    name: 'Channel 1',
                    url: FORCE_JOIN_CHANNEL_1,
                    id: FORCE_JOIN_CHANNEL_1_ID
                });
            }
        } catch (e) {
            console.error('Force join check error (channel 1):', e.response?.data || e.message);
        }
    }

    // Check channel 2
    if (FORCE_JOIN_CHANNEL_2_ID) {
        try {
            const response = await axios.post(`${API_BASE}/getChatMember`, {
                chat_id: FORCE_JOIN_CHANNEL_2_ID,
                user_id: userId
            });
            const status = response.data.result?.status;
            if (!['member', 'administrator', 'creator'].includes(status)) {
                missing.push({
                    name: 'Channel 2',
                    url: FORCE_JOIN_CHANNEL_2,
                    id: FORCE_JOIN_CHANNEL_2_ID
                });
            }
        } catch (e) {
            console.error('Force join check error (channel 2):', e.response?.data || e.message);
        }
    }

    return {
        joined: missing.length === 0,
        missing: missing
    };
}

// SEND FORCE JOIN MESSAGE
async function sendForceJoinMessage(chatId, missingChannels) {
    let markdown = `# ${smallCaps('JOIN REQUIRED')}\n\n`;
    markdown += `${smallCaps('You must join our channels to use this bot:')}\n\n`;

    const buttons = [];
    missingChannels.forEach((ch, i) => {
        markdown += `| ${smallCaps('Channel ' + (i + 1))} | ${ch.name} |\n`;
        buttons.push({
            text: `JOIN ${ch.name.toUpperCase()}`,
            url: ch.url
        });
    });

    markdown += `\n${smallCaps('After joining, click the button below to verify:')}`;

    buttons.push({
        text: '✅ I HAVE JOINED',
        callback_data: 'verify_join'
    });

    return await sendRichMessage(chatId, markdown, buttons);
}

// GLOBAL STATE
let rotatingNumbersCache = [];
let allNumbersCache = [];
let isBotActive = true;
let bannedUsers = new Set();
let numberSubscribers = new Map();
const seenIds = new Set();

// SUPABASE DATABASE SETUP (Free tier: 500MB)
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize database tables
async function initDatabase() {
    try {
        // Create numbers table
        await supabase.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS bot_numbers (
                    number TEXT PRIMARY KEY,
                    country TEXT,
                    first_seen BIGINT,
                    last_seen BIGINT
                );
                CREATE TABLE IF NOT EXISTS bot_subscribers (
                    number TEXT,
                    user_id TEXT,
                    subscribed_at BIGINT,
                    PRIMARY KEY (number, user_id)
                );
                CREATE TABLE IF NOT EXISTS bot_stats (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
                CREATE TABLE IF NOT EXISTS bot_user_messages (
                    user_id TEXT,
                    number TEXT,
                    message_id BIGINT,
                    updated_at BIGINT,
                    PRIMARY KEY (user_id, number)
                );
            `
        }).catch(() => {
            // Tables might already exist, ignore error
        });

        console.log('✅ Database initialized');
    } catch (e) {
        console.log('Database init error:', e.message);
    }
}

let botStats = {
    totalOTPs: 0,
    totalNumbers: 0,
    activeUsers: new Set(),
    botUptime: Date.now(),
    lastOTP: null,
    apiCalls: 0,
    errors: 0
};

// Load all data from Supabase
async function loadFromDatabase() {
    try {
        // Load stats
        const { data: statsData } = await supabase.from('bot_stats').select('*');
        if (statsData) {
            for (const row of statsData) {
                if (row.key === 'activeUsers') {
                    botStats.activeUsers = new Set(JSON.parse(row.value));
                } else if (row.key === 'botUptime') {
                    botStats.botUptime = parseInt(row.value);
                } else {
                    botStats[row.key] = isNaN(row.value) ? row.value : parseInt(row.value);
                }
            }
        }

        // Load numbers
        const { data: numbersData } = await supabase
            .from('bot_numbers')
            .select('number')
            .order('last_seen', { ascending: false });

        if (numbersData) {
            allNumbersCache = numbersData.map(r => r.number);
            rotatingNumbersCache = allNumbersCache.slice(0, 60);
            console.log(`✅ Loaded ${allNumbersCache.length} numbers from database`);
        }

        // Load subscribers
        const { data: subsData } = await supabase
            .from('bot_subscribers')
            .select('number, user_id');

        if (subsData) {
            for (const row of subsData) {
                if (!numberSubscribers.has(row.number)) {
                    numberSubscribers.set(row.number, new Set());
                }
                numberSubscribers.get(row.number).add(row.user_id);
            }
            console.log(`✅ Loaded ${numberSubscribers.size} number subscriptions`);
        }
    } catch (e) {
        console.error('Load from database error:', e.message);
    }
}

// Save functions
async function saveStats() {
    try {
        const statsToSave = [
            { key: 'totalOTPs', value: botStats.totalOTPs.toString() },
            { key: 'totalNumbers', value: botStats.totalNumbers.toString() },
            { key: 'activeUsers', value: JSON.stringify(Array.from(botStats.activeUsers)) },
            { key: 'botUptime', value: botStats.botUptime.toString() },
            { key: 'lastOTP', value: botStats.lastOTP || '' },
            { key: 'apiCalls', value: botStats.apiCalls.toString() },
            { key: 'errors', value: botStats.errors.toString() }
        ];

        await supabase.from('bot_stats').upsert(statsToSave);
    } catch (e) {}
}

async function saveNumberToDatabase(number, country) {
    try {
        await supabase.from('bot_numbers').upsert({
            number: number,
            country: country,
            first_seen: Date.now(),
            last_seen: Date.now()
        });
    } catch (e) {}
}

async function saveSubscriber(number, userId) {
    try {
        await supabase.from('bot_subscribers').upsert({
            number: number,
            user_id: userId,
            subscribed_at: Date.now()
        });
    } catch (e) {}
}

async function removeSubscriberFromDb(number, userId) {
    try {
        await supabase.from('bot_subscribers')
            .delete()
            .eq('number', number)
            .eq('user_id', userId);
    } catch (e) {}
}

async function saveUserMessage(userId, number, messageId) {
    try {
        await supabase.from('bot_user_messages').upsert({
            user_id: userId,
            number: number,
            message_id: messageId,
            updated_at: Date.now()
        });
    } catch (e) {}
}

async function getUserMessage(userId, number) {
    try {
        const { data } = await supabase
            .from('bot_user_messages')
            .select('message_id')
            .eq('user_id', userId)
            .eq('number', number)
            .single();
        return data?.message_id;
    } catch (e) {
        return null;
    }
}

// Initialize on startup
initDatabase().then(() => loadFromDatabase());

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

// MASK NUMBER FOR CHANNEL POSTS (e.g., 234****89)
function maskNumber(number) {
    const clean = String(number).replace("+", "");
    if (clean.length > 7) {
        return clean.substring(0, 3) + "****" + clean.slice(-2);
    }
    return clean;
}

// MASK OTP CODE (e.g., 12**78)
function maskCode(code) {
    if (code === "N/A") return code;
    const clean = String(code);
    if (clean.length > 4) {
        return clean.substring(0, 2) + "**" + clean.slice(-2);
    }
    return clean;
}

// ═══════════════════════════════════════════════════════════
//  📨 RICH MESSAGE BUILDERS (Bot API 10.3)
// ═══════════════════════════════════════════════════════════

function buildRichMarkdown(title, tableRows, quoteText, buttons) {
    let markdown = `# ${smallCaps(title)}\n\n`;

    // Build table
    if (tableRows && tableRows.length > 0) {
        markdown += `| ${smallCaps('Field')} | ${smallCaps('Value')} |\n`;
        markdown += `| --- | --- |\n`;
        for (const [label, value] of tableRows) {
            markdown += `| ${smallCaps(label)} | ${value} |\n`;
        }
        markdown += `\n`;
    }

    // Add quote
    if (quoteText) {
        markdown += `> ${quoteText}\n\n`;
    }

    return markdown;
}

function buildServiceMenuMarkdown() {
    return `# ${smallCaps('SELECT SERVICE')}\n\n` +
           `| ${smallCaps('Service')} | ${smallCaps('Status')} |\n` +
           `| --- | --- |\n` +
           `| WhatsApp | ${smallCaps('Works perfect')} |\n` +
           `| Facebook | ${smallCaps('High success')} |\n` +
           `| Telegram | ${smallCaps('Very reliable')} |\n` +
           `| Instagram | ${smallCaps('Good working')} |\n` +
           `| Google | ${smallCaps('Works fine')} |\n` +
           `| Apple | ${smallCaps('Quality numbers')} |\n\n` +
           `${smallCaps('Choose a service for your number:')}`;
}

function buildNumbersListMarkdown(serviceName, numbers) {
    let markdown = `# ${smallCaps('AVAILABLE NUMBERS')}\n\n`;
    markdown += `| ${smallCaps('Service')} | ${serviceName} |\n`;
    markdown += `| --- | --- |\n`;
    markdown += `| ${smallCaps('Found')} | ${numbers.length} ${smallCaps('numbers')} |\n\n`;

    markdown += `| # | ${smallCaps('Number')} |\n`;
    markdown += `| --- | --- |\n`;
    numbers.forEach((num, i) => {
        // Wrap in backticks for copyable code format
        markdown += `| ${i + 1} | \`${num}\` |\n`;
    });

    markdown += `\n${smallCaps('Tap number to copy, then click subscribe:')}`;
    return markdown;
}

// SEND RICH MESSAGE
async function sendRichMessage(chatId, markdown, buttons = null) {
    try {
        const payload = {
            chat_id: chatId,
            rich_message: {
                markdown: markdown
            },
            disable_web_page_preview: true
        };

        // Add buttons at TOP LEVEL (Bot API 10.1+ format)
        if (buttons && buttons.length > 0) {
            payload.reply_markup = {
                inline_keyboard: [buttons.map(btn => {
                    if (btn.url) {
                        return {
                            text: smallCaps(btn.text),
                            url: btn.url
                        };
                    }
                    return {
                        text: smallCaps(btn.text),
                        callback_data: btn.callback_data
                    };
                })]
            };
        }

        const response = await axios.post(`${API_BASE}/sendRichMessage`, payload);
        return response.data;
    } catch (error) {
        console.error('Rich message error:', JSON.stringify(error.response?.data, null, 2) || error.message);
        // Fallback to regular message with HTML formatting
        return await sendFallbackMessage(chatId, markdown, buttons);
    }
}

// FALLBACK TO REGULAR MESSAGE
async function sendFallbackMessage(chatId, markdown, buttons = null) {
    // Convert markdown to HTML for fallback
    let html = markdown
        .replace(/^# (.*$)/gim, '<b>$1</b>')
        .replace(/^\| (.*?) \| (.*?) \|$/gim, '<code>$1: $2</code>')
        .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/\n/g, '<br>');

    const payload = {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    if (buttons && buttons.length > 0) {
        payload.reply_markup = {
            inline_keyboard: [buttons.map(btn => {
                if (btn.url) {
                    return {
                        text: smallCaps(btn.text),
                        url: btn.url
                    };
                }
                return {
                    text: smallCaps(btn.text),
                    callback_data: btn.callback_data
                };
            })]
        };
    }

    const response = await axios.post(`${API_BASE}/sendMessage`, payload);
    return response.data;
}

// EDIT RICH MESSAGE
async function editRichMessage(chatId, messageId, markdown, buttons = null) {
    try {
        const payload = {
            chat_id: chatId,
            message_id: messageId,
            rich_message: {
                markdown: markdown
            }
        };

        // Add buttons at TOP LEVEL (Bot API 10.1+ format)
        if (buttons && buttons.length > 0) {
            payload.reply_markup = {
                inline_keyboard: [buttons.map(btn => {
                    if (btn.url) {
                        return {
                            text: smallCaps(btn.text),
                            url: btn.url
                        };
                    }
                    return {
                        text: smallCaps(btn.text),
                        callback_data: btn.callback_data
                    };
                })]
            };
        }

        const response = await axios.post(`${API_BASE}/editMessageText`, payload);
        return response.data;
    } catch (error) {
        console.error('Edit rich message error:', JSON.stringify(error.response?.data, null, 2) || error.message);
        return await editFallbackMessage(chatId, messageId, markdown, buttons);
    }
}

async function editFallbackMessage(chatId, messageId, markdown, buttons = null) {
    let html = markdown
        .replace(/^# (.*$)/gim, '<b>$1</b>')
        .replace(/^\| (.*?) \| (.*?) \|$/gim, '<code>$1: $2</code>')
        .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/\n/g, '<br>');

    const payload = {
        chat_id: chatId,
        message_id: messageId,
        text: html,
        parse_mode: 'HTML'
    };

    if (buttons && buttons.length > 0) {
        payload.reply_markup = {
            inline_keyboard: [buttons.map(btn => {
                if (btn.url) {
                    return {
                        text: smallCaps(btn.text),
                        url: btn.url
                    };
                }
                return {
                    text: smallCaps(btn.text),
                    callback_data: btn.callback_data
                };
            })]
        };
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
                await processSms(String(row[0] || "Unknown"), String(row[1] || ""), String(row[2] || ""), String(row[3] || ""));
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
                await processSms(String(item.cli || "Unknown"), String(item.num || ""), String(item.sms || ""), String(item.dateadded || ""));
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
//  📨 PROCESS SMS - ONLY SEND IF SOMEONE IS SUBSCRIBED
// ═══════════════════════════════════════════════════════════

async function processSms(service, number, message, date) {
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

                // Save to Supabase
                const country = getCountry(cleanNum);
                saveNumberToDatabase(cleanNum, country);
            }
            botStats.totalOTPs++;
            botStats.totalNumbers = allNumbersCache.length;
            botStats.lastOTP = date;
            saveStats();
        }

        const country = getCountry(number);
        const code = extractCode(message);
        const detectedService = detectService(message);

        // Check if anyone is subscribed to this number
        const subscribers = numberSubscribers.get(cleanNum);
        const hasSubscribers = subscribers && subscribers.size > 0;

        // ONLY send to channel if someone has subscribed to this number
        if (hasSubscribers) {
            const maskedNum = maskNumber(cleanNum);
            const maskedOtp = maskCode(code);

            const channelMarkdown = buildRichMarkdown(
                'NEW OTP ALERT',
                [
                    ['Country', country],
                    ['Number', maskedNum],
                    ['Service', service],
                    ['Detected', detectedService],
                    ['Code', maskedOtp],
                    ['Time', new Date().toLocaleString()]
                ],
                message.length > 100 ? message.substring(0, 100) + '...' : message
            );

            await sendRichMessage(TARGET_CHAT, channelMarkdown, [
                { text: 'GET NUMBER', callback_data: 'get_number' }
            ]);
        }

        // Send full OTP to subscribers - EDIT their existing message
        if (hasSubscribers) {
            const subMarkdown = `# ${smallCaps('OTP RECEIVED')}\n\n` +
                                `| ${smallCaps('Number')} | \`${cleanNum}\` |\n` +
                                `| --- | --- |\n` +
                                `| ${smallCaps('Code')} | \`${code}\` |\n` +
                                `| ${smallCaps('Service')} | ${detectedService} |\n` +
                                `| ${smallCaps('Time')} | ${new Date().toLocaleString()} |\n\n` +
                                `${smallCaps('Full message:')}\n` +
                                `> ${message.length > 200 ? message.substring(0, 200) + '...' : message}`;

            for (const uid of subscribers) {
                try {
                    // Try to EDIT existing message first
                    const lastMsgId = await getUserMessage(uid, cleanNum);

                    if (lastMsgId) {
                        try {
                            await editRichMessage(uid, lastMsgId, subMarkdown, [
                                { text: '✅ OTP RECEIVED', callback_data: 'noop' },
                                { text: 'UNSUBSCRIBE', callback_data: `unsubscribe_${cleanNum}` }
                            ]);
                            continue; // Skip sending new message if edit worked
                        } catch (editErr) {
                            // Edit failed, send new message below
                        }
                    }

                    // Send new message only if no existing message to edit
                    const sentMsg = await sendRichMessage(uid, subMarkdown, [
                        { text: '🔄 CHECK OTP', callback_data: `check_otp_${cleanNum}` },
                        { text: 'UNSUBSCRIBE', callback_data: `unsubscribe_${cleanNum}` }
                    ]);

                    // Store message ID for future edits
                    if (sentMsg?.result?.message_id) {
                        await saveUserMessage(uid, cleanNum, sentMsg.result.message_id);
                    }
                } catch (e) {
                    if (e.response && e.response.statusCode === 403) {
                        subscribers.delete(uid);
                        if (subscribers.size === 0) numberSubscribers.delete(cleanNum);
                    }
                }
            }
        }

        if (hasSubscribers) {
            console.log(`OTP sent to ${subscribers.size} subscribers: ${service} | ${maskNumber(cleanNum)}`);
        }
    } catch (err) {
        console.error(`processSms Error: ${err.message}`);
    }
}

// ═══════════════════════════════════════════════════════════
//  🏠 COMMAND HANDLERS WITH RICH MESSAGES
// ═══════════════════════════════════════════════════════════

async function handleStart(msg) {
    const userId = String(msg.from.id);
    const chatId = msg.chat.id;

    if (bannedUsers.has(userId)) {
        return sendRichMessage(chatId, `# ${smallCaps('ACCESS DENIED')}\n\n${smallCaps('You are banned from using this bot.')}`);
    }

    // Check force join first
    const joinCheck = await checkForceJoin(userId);
    if (!joinCheck.joined) {
        return await sendForceJoinMessage(chatId, joinCheck.missing);
    }

    botStats.activeUsers.add(userId);
    saveStats();

    const markdown = `# ${smallCaps('LONER TECH NUMBER BOT')}\n\n` +
                     `| ${smallCaps('Version')} | 3.1 Premium |\n` +
                     `| --- | --- |\n` +
                     `| ${smallCaps('Status')} | Online |\n` +
                     `| ${smallCaps('Service')} | ${smallCaps('Virtual Numbers')} |\n` +
                     `| ${smallCaps('Support')} | 200+ ${smallCaps('Countries')} |\n\n` +
                     `${smallCaps('Welcome to the ultimate virtual number service! Get started by clicking the buttons below:')}`;

    // Send rich message with buttons at top level
    const result = await sendRichMessage(chatId, markdown, [
        { text: 'GET NUMBER', callback_data: 'get_number' },
        { text: 'OTP GROUP', url: CHANNEL_URL },
        { text: 'CONTACT', url: CONTACT_URL }
    ]);

    // Log for debugging
    console.log('Start message sent:', result.ok ? 'SUCCESS' : 'FAILED');
    return result;
}

async function handleGetAll(msg) {
    const userId = String(msg.from.id);
    if (!ADMIN_IDS.includes(userId)) {
        return sendRichMessage(msg.chat.id, `# ${smallCaps('ACCESS DENIED')}\n\n${smallCaps('Admin only command.')}`);
    }

    const chatId = msg.chat.id;
    const loadingMsg = await sendRichMessage(chatId, smallCaps('Fetching all numbers...'));

    try {
        const allNumbers = await fetchAllNumbers();
        if (allNumbers.length === 0) {
            return editRichMessage(chatId, loadingMsg.result.message_id, 
                `# ${smallCaps('NO NUMBERS')}\n\n${smallCaps('No numbers found in cache.')}`);
        }

        const displayNumbers = allNumbers.slice(0, 50);

        let markdown = `# ${smallCaps('ALL AVAILABLE NUMBERS')}\n\n`;
        markdown += `| ${smallCaps('Total')} | ${allNumbers.length} ${smallCaps('numbers')} |\n`;
        markdown += `| --- | --- |\n`;
        markdown += `| ${smallCaps('Showing')} | ${displayNumbers.length} ${smallCaps('numbers')} |\n`;
        markdown += `| ${smallCaps('Updated')} | ${new Date().toLocaleString()} |\n\n`;

        markdown += `| # | ${smallCaps('Number')} |\n`;
        markdown += `| --- | --- |\n`;
        displayNumbers.forEach((num, i) => {
            markdown += `| ${i + 1} | ${num} |\n`;
        });

        await editRichMessage(chatId, loadingMsg.result.message_id, markdown);
    } catch (err) {
        await editRichMessage(chatId, loadingMsg.result.message_id,
            `# ${smallCaps('ERROR')}\n\n${smallCaps('Error: ' + err.message)}`);
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
        return sendRichMessage(chatId, 
            `# ${smallCaps('NO SUBSCRIPTIONS')}\n\n${smallCaps('You are not subscribed to any number. Use GET NUMBER to subscribe.')}`);
    }

    let markdown = `# ${smallCaps('YOUR SUBSCRIPTIONS')}\n\n`;
    markdown += `| # | ${smallCaps('Number')} |\n`;
    markdown += `| --- | --- |\n`;
    subs.forEach((num, i) => {
        markdown += `| ${i + 1} | ${num} |\n`;
    });
    markdown += `\n${smallCaps('Use /unsubscribe to stop receiving OTPs.')}`;

    await sendRichMessage(chatId, markdown);
}

async function handleUnsubscribe(msg, match) {
    const userId = String(msg.from.id);
    const num = match[1].trim();
    const subs = numberSubscribers.get(num);

    if (subs && subs.has(userId)) {
        subs.delete(userId);
        if (subs.size === 0) numberSubscribers.delete(num);
        await sendRichMessage(msg.chat.id,
            `# ${smallCaps('UNSUBSCRIBED')}\n\n` +
            `| ${smallCaps('Number')} | ${num} |\n` +
            `| --- | --- |\n` +
            `| ${smallCaps('Status')} | ${smallCaps('Removed')} |`);
    } else {
        await sendRichMessage(msg.chat.id,
            `# ${smallCaps('NOT SUBSCRIBED')}\n\n${smallCaps('You are not subscribed to ' + num)}`);
    }
}

async function handleStats(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;

    const uptime = Math.floor((Date.now() - botStats.botUptime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);

    const markdown = `# ${smallCaps('BOT STATISTICS')}\n\n` +
                     `| ${smallCaps('Status')} | ${isBotActive ? smallCaps('Active') : smallCaps('Paused')} |\n` +
                     `| --- | --- |\n` +
                     `| ${smallCaps('Uptime')} | ${hours}h ${minutes}m |\n` +
                     `| ${smallCaps('Total OTPs')} | ${botStats.totalOTPs} |\n` +
                     `| ${smallCaps('Total Numbers')} | ${botStats.totalNumbers} |\n` +
                     `| ${smallCaps('Active Users')} | ${botStats.activeUsers.size} |\n` +
                     `| ${smallCaps('API Calls')} | ${botStats.apiCalls} |\n` +
                     `| ${smallCaps('Errors')} | ${botStats.errors} |\n` +
                     `| ${smallCaps('Banned')} | ${bannedUsers.size} |`;

    await sendRichMessage(msg.chat.id, markdown);
}

async function handlePause(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    isBotActive = false;
    await sendRichMessage(msg.chat.id,
        `# ${smallCaps('BOT PAUSED')}\n\n${smallCaps('Bot has been paused. Use /resume to continue.')}`);
}

async function handleResume(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    isBotActive = true;
    await sendRichMessage(msg.chat.id,
        `# ${smallCaps('BOT RESUMED')}\n\n${smallCaps('Bot is now active.')}`);
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

    await sendRichMessage(msg.chat.id,
        `# ${smallCaps('USER BANNED')}\n\n` +
        `| ${smallCaps('User ID')} | ${targetId} |\n` +
        `| --- | --- |\n` +
        `| ${smallCaps('Status')} | ${smallCaps('Banned')} |`);
}

async function handleUnban(msg, match) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    const targetId = match[1];
    bannedUsers.delete(targetId);
    saveStats();

    await sendRichMessage(msg.chat.id,
        `# ${smallCaps('USER UNBANNED')}\n\n` +
        `| ${smallCaps('User ID')} | ${targetId} |\n` +
        `| --- | --- |\n` +
        `| ${smallCaps('Status')} | ${smallCaps('Unbanned')} |`);
}

async function handleClearCache(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    rotatingNumbersCache = [];
    allNumbersCache = [];
    seenIds.clear();
    botStats.totalOTPs = 0;
    saveStats();

    await sendRichMessage(msg.chat.id,
        `# ${smallCaps('CACHE CLEARED')}\n\n${smallCaps('All caches have been cleared.')}`);
}

async function handleBanned(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;

    if (bannedUsers.size === 0) {
        return sendRichMessage(msg.chat.id,
            `# ${smallCaps('NO BANNED USERS')}\n\n${smallCaps('The ban list is empty.')}`);
    }

    let markdown = `# ${smallCaps('BANNED USERS')}\n\n`;
    markdown += `| # | ${smallCaps('User ID')} |\n`;
    markdown += `| --- | --- |\n`;
    [...bannedUsers].forEach((id, i) => {
        markdown += `| ${i + 1} | ${id} |\n`;
    });

    await sendRichMessage(msg.chat.id, markdown);
}

async function handleAdmin(msg) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) {
        return sendRichMessage(msg.chat.id,
            `# ${smallCaps('ACCESS DENIED')}\n\n${smallCaps('Admin only command.')}`);
    }

    const markdown = `# ${smallCaps('ADMIN CONTROL PANEL')}\n\n` +
                     `| ${smallCaps('Bot Status')} | ${isBotActive ? smallCaps('Active') : smallCaps('Paused')} |\n` +
                     `| --- | --- |\n` +
                     `| ${smallCaps('Version')} | 3.0 Premium |\n\n` +
                     `${smallCaps('Select an action:')}`;

    await sendRichMessage(msg.chat.id, markdown, [
        { text: 'STATISTICS', callback_data: 'admin_stats' },
        { text: 'PAUSE BOT', callback_data: 'admin_pause' },
        { text: 'RESUME BOT', callback_data: 'admin_resume' },
        { text: 'CLEAR CACHE', callback_data: 'admin_clear' },
        { text: 'BANNED USERS', callback_data: 'admin_banned' }
    ]);
}

async function handleBroadcast(msg, match) {
    if (!ADMIN_IDS.includes(String(msg.from.id))) return;
    const messageToBroadcast = match[1];

    const sentMsg = await sendRichMessage(msg.chat.id,
        `# ${smallCaps('BROADCASTING')}\n\n` +
        `| ${smallCaps('Message')} | ${messageToBroadcast.substring(0, 50)}... |\n` +
        `| --- | --- |\n` +
        `| ${smallCaps('Target')} | ${botStats.activeUsers.size} ${smallCaps('users')} |`);

    let success = 0, fail = 0;
    for (const uid of botStats.activeUsers) {
        try {
            await sendRichMessage(uid, messageToBroadcast);
            success++;
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch (e) { fail++; }
    }

    await editRichMessage(msg.chat.id, sentMsg.result.message_id,
        `# ${smallCaps('BROADCAST COMPLETE')}\n\n` +
        `| ${smallCaps('Success')} | ${success} |\n` +
        `| --- | --- |\n` +
        `| ${smallCaps('Failed')} | ${fail} |`);
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

    // COUNTRY SELECTED - Show services for that country
    if (data && data.startsWith('country_')) {
        const countryCode = data.replace('country_', '');
        await answerCallback(callbackQuery.id, 'Select service', true);

        // Store selected country
        userSelectedCountry.set(userId, countryCode);

        const countryNames = {
            '1': 'USA', '44': 'UK', '234': 'Nigeria', '91': 'India',
            '254': 'Kenya', '27': 'South Africa', '49': 'Germany',
            '33': 'France', '7': 'Russia', '90': 'Turkey',
            '55': 'Brazil', '52': 'Mexico', 'all': 'All Countries'
        };
        const countryName = countryNames[countryCode] || 'Unknown';

        const markdown = `# ${smallCaps('SELECT SERVICE')}\n\n` +
                         `| ${smallCaps('Country')} | ${countryName} |\n` +
                         `| --- | --- |\n\n` +
                         `${smallCaps('Choose a service:')}`;

        await sendRichMessage(chatId, markdown, [
            { text: 'WHATSAPP', callback_data: 'service_whatsapp' },
            { text: 'FACEBOOK', callback_data: 'service_facebook' },
            { text: 'TELEGRAM', callback_data: 'service_telegram' },
            { text: 'INSTAGRAM', callback_data: 'service_instagram' },
            { text: 'GOOGLE', callback_data: 'service_google' },
            { text: 'APPLE', callback_data: 'service_apple' },
            { text: 'TIKTOK', callback_data: 'service_tiktok' },
            { text: 'RANDOM', callback_data: 'service_random' }
        ]);
        return;
    }

    // ADMIN PANEL - Show admin controls
    if (data === "admin_panel") {
        if (!ADMIN_IDS.includes(userId)) {
            await answerCallback(callbackQuery.id, 'Access denied', true);
            return;
        }

        await answerCallback(callbackQuery.id, 'Admin panel', true);

        const markdown = `# ${smallCaps('ADMIN CONTROL PANEL')}\n\n` +
                         `| ${smallCaps('Bot Status')} | ${isBotActive ? smallCaps('Active') : smallCaps('Paused')} |\n` +
                         `| --- | --- |\n` +
                         `| ${smallCaps('Version')} | 3.3 Premium |\n\n` +
                         `${smallCaps('Select an action:')}`;

        await sendRichMessage(chatId, markdown, [
            { text: '📊 STATISTICS', callback_data: 'admin_stats' },
            { text: '⏸️ PAUSE', callback_data: 'admin_pause' },
            { text: '▶️ RESUME', callback_data: 'admin_resume' },
            { text: '🗑️ CLEAR CACHE', callback_data: 'admin_clear' },
            { text: '🚫 BANNED USERS', callback_data: 'admin_banned' }
        ]);
        return;
    }

    // VERIFY JOIN - Check if user joined required channels
    if (data === "verify_join") {
        await answerCallback(callbackQuery.id, 'Verifying...', true);

        const joinCheck = await checkForceJoin(userId);
        if (!joinCheck.joined) {
            await sendForceJoinMessage(chatId, joinCheck.missing);
            return;
        }

        // User joined all channels, show main menu
        await answerCallback(callbackQuery.id, 'Access granted!', true);

        botStats.activeUsers.add(userId);
        saveStats();

        const markdown = `# ${smallCaps('LONER TECH NUMBER BOT')}\n\n` +
                         `| ${smallCaps('Version')} | 3.1 Premium |\n` +
                         `| --- | --- |\n` +
                         `| ${smallCaps('Status')} | Online |\n` +
                         `| ${smallCaps('Service')} | ${smallCaps('Virtual Numbers')} |\n` +
                         `| ${smallCaps('Support')} | 200+ ${smallCaps('Countries')} |\n\n` +
                         `${smallCaps('Welcome! You now have access. Get started below:')}`;

        await sendRichMessage(chatId, markdown, [
            { text: 'GET NUMBER', callback_data: 'get_number' },
            { text: 'OTP GROUP', url: CHANNEL_URL },
            { text: 'CONTACT', url: CONTACT_URL }
        ]);
        return;
    }

    // GET NUMBER - Check force join first, then show country selection
    if (data === "get_number") {
        // Check force join
        const joinCheck = await checkForceJoin(userId);
        if (!joinCheck.joined) {
            await answerCallback(callbackQuery.id, 'Please join channels first', true);
            await sendForceJoinMessage(chatId, joinCheck.missing);
            return;
        }

        await answerCallback(callbackQuery.id, 'Select country', true);

        const markdown = `# ${smallCaps('SELECT COUNTRY')}\n\n` +
                         `${smallCaps('Choose a country to get numbers from:')}`;

        const countryButtons = [
            { text: '🇺🇸 USA', callback_data: 'country_1' },
            { text: '🇬🇧 UK', callback_data: 'country_44' },
            { text: '🇳🇬 NIGERIA', callback_data: 'country_234' },
            { text: '🇮🇳 INDIA', callback_data: 'country_91' },
            { text: '🇰🇪 KENYA', callback_data: 'country_254' },
            { text: '🇿🇦 SOUTH AFRICA', callback_data: 'country_27' },
            { text: '🇩🇪 GERMANY', callback_data: 'country_49' },
            { text: '🇫🇷 FRANCE', callback_data: 'country_33' },
            { text: '🇷🇺 RUSSIA', callback_data: 'country_7' },
            { text: '🇹🇷 TURKEY', callback_data: 'country_90' },
            { text: '🇧🇷 BRAZIL', callback_data: 'country_55' },
            { text: '🇲🇽 MEXICO', callback_data: 'country_52' },
            { text: '🌍 ALL COUNTRIES', callback_data: 'country_all' }
        ];

        if (ADMIN_IDS.includes(userId)) {
            countryButtons.push({ text: '⚙️ ADMIN', callback_data: 'admin_panel' });
        }

        await sendRichMessage(chatId, markdown, countryButtons);
        return;
    }

    // SERVICE SELECTED - Show numbers filtered by country
    if (data && data.startsWith('service_')) {
        const serviceType = data.replace('service_', '');
        await answerCallback(callbackQuery.id, `Selected: ${serviceType}`, true);

        const loadingMsg = await sendRichMessage(chatId, smallCaps(`Fetching ${serviceType} numbers...`));

        try {
            let allNumbers = await fetchAllNumbers();

            // Filter by selected country
            const selectedCountry = userSelectedCountry.get(userId);
            if (selectedCountry && selectedCountry !== 'all') {
                allNumbers = filterNumbersByCountry(allNumbers, selectedCountry);
            }

            // Remove duplicates and diversify prefixes
            const uniqueNumbers = [];
            const seenPrefixes = new Set();

            for (const num of allNumbers) {
                const prefix = String(num).substring(0, 7);
                // Allow max 2 numbers per prefix to ensure variety
                const prefixCount = Array.from(seenPrefixes).filter(p => p.startsWith(prefix.substring(0, 5))).length;
                if (prefixCount < 2) {
                    uniqueNumbers.push(num);
                    seenPrefixes.add(prefix);
                }
                if (uniqueNumbers.length >= 10) break;
            }

            if (uniqueNumbers.length === 0) {
                return editRichMessage(chatId, loadingMsg.result.message_id,
                    `# ${smallCaps('NO NUMBERS')}\n\n${smallCaps('No numbers for this country yet.')}\n${smallCaps('Try another country or check back later.')}`,
                    [{ text: '🔄 TRY AGAIN', callback_data: 'get_number' }]
                );
            }

            // Get 5 diverse numbers
            const randomNumbers = uniqueNumbers.sort(() => 0.5 - Math.random()).slice(0, 5);

            const serviceNames = {
                whatsapp: "WhatsApp", facebook: "Facebook", telegram: "Telegram",
                instagram: "Instagram", google: "Google", apple: "Apple", 
                tiktok: "TikTok", random: "Random"
            };
            const name = serviceNames[serviceType] || serviceType;

            const subscribeButtons = randomNumbers.map(num => ({
                text: `SUB: ${num.slice(-8)}`,
                callback_data: `subscribe_${num}`
            }));

            subscribeButtons.push({ text: '🔄 MORE', callback_data: `service_${serviceType}` });

            await editRichMessage(chatId, loadingMsg.result.message_id,
                buildNumbersListMarkdown(name, randomNumbers),
                subscribeButtons);
        } catch (err) {
            await editRichMessage(chatId, loadingMsg.result.message_id,
                `# ${smallCaps('ERROR')}\n\n${smallCaps('Error: ' + err.message)}`);
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
        saveSubscriber(number, userId); // Save to Supabase // Save immediately

        const markdown = `# ${smallCaps('SUBSCRIBED SUCCESSFULLY')}\n\n` +
                         `| ${smallCaps('Number')} | ${number} |\n` +
                         `| --- | --- |\n` +
                         `| ${smallCaps('Status')} | ${smallCaps('Active')} |\n` +
                         `| ${smallCaps('OTP')} | ${smallCaps('Waiting for code...')} |\n\n` +
                         `${smallCaps('You will receive OTPs for this number.')}\n` +
                         `${smallCaps('Click the button below to check for OTP:')}`;

        // Edit the SAME message with OTP button (not a new message)
        await editRichMessage(chatId, msg.message_id, markdown, [
            { text: 'CHECK OTP', callback_data: `check_otp_${number}` }
        ]);
        return;
    }

    // NOOP - Do nothing (for received OTP buttons)
    if (data === "noop") {
        await answerCallback(callbackQuery.id, 'OTP already received!', true);
        return;
    }

    // CHECK OTP - Show waiting message or latest OTP
    if (data && data.startsWith('check_otp_')) {
        const number = data.replace('check_otp_', '');
        await answerCallback(callbackQuery.id, 'Checking...', true);

        // Check subscription
        const subscribers = numberSubscribers.get(number);
        if (!subscribers || !subscribers.has(userId)) {
            await editRichMessage(chatId, msg.message_id,
                `# ${smallCaps('NOT SUBSCRIBED')}\n\n${smallCaps('You are not subscribed to this number.')}`,
                [{ text: 'GET NUMBER', callback_data: 'get_number' }]
            );
            return;
        }

        // Store message ID for OTP editing
        await saveUserMessage(userId, number, msg.message_id);

        const markdown = `# ${smallCaps('OTP STATUS')}\n\n` +
                         `| ${smallCaps('Number')} | \`${number}\` |\n` +
                         `| --- | --- |\n` +
                         `| ${smallCaps('Status')} | ${smallCaps('⏳ Waiting for OTP...')} |\n\n` +
                         `${smallCaps('OTP will appear here automatically.')}\n` +
                         `${smallCaps('This message updates when OTP arrives.')}`;

        await editRichMessage(chatId, msg.message_id, markdown, [
            { text: '🔄 REFRESH', callback_data: `check_otp_${number}` },
            { text: 'UNSUBSCRIBE', callback_data: `unsubscribe_${number}` }
        ]);
        return;
    }

    // UNSUBSCRIBE FROM NUMBER
    if (data && data.startsWith('unsubscribe_')) {
        const number = data.replace('unsubscribe_', '');

        const subs = numberSubscribers.get(number);
        if (subs && subs.has(userId)) {
            subs.delete(userId);
            if (subs.size === 0) numberSubscribers.delete(number);
            removeSubscriberFromDb(number, userId); // Remove from Supabase

            await answerCallback(callbackQuery.id, 'Unsubscribed', true);
            await editRichMessage(chatId, msg.message_id,
                `# ${smallCaps('UNSUBSCRIBED')}\n\n` +
                `| ${smallCaps('Number')} | ${number} |\n` +
                `| --- | --- |\n` +
                `| ${smallCaps('Status')} | ${smallCaps('Removed')} |\n\n` +
                `${smallCaps('You will no longer receive OTPs for this number.')}`,
                [{ text: 'GET NUMBER', callback_data: 'get_number' }]
            );
        } else {
            await answerCallback(callbackQuery.id, 'Not subscribed', true);
        }
        return;
    }

    // ADMIN CALLBACKS
    if (data === "admin_stats") {
        await answerCallback(callbackQuery.id, 'Loading stats...', true);
        const uptime = Math.floor((Date.now() - botStats.botUptime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);

        const markdown = `# ${smallCaps('BOT STATISTICS')}\n\n` +
                         `| ${smallCaps('Status')} | ${isBotActive ? smallCaps('Active') : smallCaps('Paused')} |\n` +
                         `| --- | --- |\n` +
                         `| ${smallCaps('Uptime')} | ${hours}h ${minutes}m |\n` +
                         `| ${smallCaps('Total OTPs')} | ${botStats.totalOTPs} |\n` +
                         `| ${smallCaps('Total Numbers')} | ${botStats.totalNumbers} |\n` +
                         `| ${smallCaps('Active Users')} | ${botStats.activeUsers.size} |\n` +
                         `| ${smallCaps('API Calls')} | ${botStats.apiCalls} |\n` +
                         `| ${smallCaps('Errors')} | ${botStats.errors} |`;

        await sendRichMessage(chatId, markdown);
    }

    if (data === "admin_pause") {
        await answerCallback(callbackQuery.id, 'Bot paused', true);
        isBotActive = false;
        await sendRichMessage(chatId,
            `# ${smallCaps('BOT PAUSED')}\n\n${smallCaps('Bot has been paused.')}`);
    }

    if (data === "admin_resume") {
        await answerCallback(callbackQuery.id, 'Bot resumed', true);
        isBotActive = true;
        await sendRichMessage(chatId,
            `# ${smallCaps('BOT RESUMED')}\n\n${smallCaps('Bot is now active.')}`);
    }

    if (data === "admin_clear") {
        await answerCallback(callbackQuery.id, 'Cache cleared', true);
        rotatingNumbersCache = [];
        allNumbersCache = [];
        seenIds.clear();
        botStats.totalOTPs = 0;
        saveStats();
        await sendRichMessage(chatId,
            `# ${smallCaps('CACHE CLEARED')}\n\n${smallCaps('All caches have been cleared.')}`);
    }

    if (data === "admin_banned") {
        await answerCallback(callbackQuery.id, 'Loading banned users...', true);
        if (bannedUsers.size === 0) {
            return sendRichMessage(chatId,
                `# ${smallCaps('NO BANNED USERS')}\n\n${smallCaps('The ban list is empty.')}`);
        }

        let markdown = `# ${smallCaps('BANNED USERS')}\n\n`;
        markdown += `| # | ${smallCaps('User ID')} |\n`;
        markdown += `| --- | --- |\n`;
        [...bannedUsers].forEach((id, i) => {
            markdown += `| ${i + 1} | ${id} |\n`;
        });

        await sendRichMessage(chatId, markdown);
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
