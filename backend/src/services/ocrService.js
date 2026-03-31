import Tesseract from "tesseract.js";

/**
 * OCR Service for Receipt Scanning
 * Extracts structured data from receipt images
 */

// Common expense categories
const EXPENSE_CATEGORIES = [
  "meals", "travel", "accommodation", "transport", "office_supplies",
  "entertainment", "communication", "software", "equipment", "other"
];

// Keywords to identify categories
const CATEGORY_KEYWORDS = {
  meals: ["restaurant", "cafe", "coffee", "food", "lunch", "dinner", "breakfast", "pizza", "burger", "sushi", "bar", "grill", "kitchen", "diner", "bistro", "eatery"],
  travel: ["airline", "flight", "airways", "airport", "boarding", "booking"],
  accommodation: ["hotel", "inn", "motel", "resort", "airbnb", "lodging", "stay"],
  transport: ["uber", "lyft", "taxi", "cab", "parking", "fuel", "gas", "petrol", "metro", "bus", "train"],
  office_supplies: ["staples", "office", "paper", "ink", "stationery", "supplies"],
  entertainment: ["cinema", "movie", "theatre", "concert", "ticket", "event"],
  communication: ["phone", "mobile", "telecom", "internet", "broadband"],
  software: ["software", "subscription", "saas", "license", "app"],
  equipment: ["electronics", "computer", "laptop", "hardware", "device"]
};

// Currency patterns
const CURRENCY_PATTERNS = {
  USD: /\$\s*([\d,]+\.?\d*)/g,
  EUR: /€\s*([\d,]+\.?\d*)/g,
  GBP: /£\s*([\d,]+\.?\d*)/g,
  INR: /₹\s*([\d,]+\.?\d*)|Rs\.?\s*([\d,]+\.?\d*)|INR\s*([\d,]+\.?\d*)/gi,
  JPY: /¥\s*([\d,]+\.?\d*)/g,
};

// Date patterns
const DATE_PATTERNS = [
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/g,  // DD/MM/YYYY or MM/DD/YYYY
  /(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/g,    // YYYY/MM/DD
  /(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})/gi,           // Month DD, YYYY
  /(\d{1,2})\s+(\w{3,9})\s+(\d{4})/gi,             // DD Month YYYY
];

/**
 * Extract text from image using Tesseract OCR
 */
export async function extractTextFromImage(imageBuffer) {
  try {
    const { data: { text, confidence } } = await Tesseract.recognize(
      imageBuffer,
      "eng",
      {
        logger: m => console.log(`OCR Progress: ${m.status} - ${Math.round(m.progress * 100)}%`)
      }
    );

    return {
      rawText: text,
      confidence: confidence
    };
  } catch (error) {
    console.error("OCR Error:", error);
    throw new Error("Failed to extract text from image");
  }
}

/**
 * Extract monetary amounts from text
 */
function extractAmounts(text) {
  const amounts = [];
  
  // Try each currency pattern
  for (const [currency, pattern] of Object.entries(CURRENCY_PATTERNS)) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      const value = match[1] || match[2] || match[3];
      if (value) {
        const numericValue = parseFloat(value.replace(/,/g, ""));
        if (!isNaN(numericValue) && numericValue > 0) {
          amounts.push({
            value: numericValue,
            currency: currency,
            original: match[0]
          });
        }
      }
    }
  }

  // Also look for generic number patterns that might be totals
  const totalPatterns = [
    /total[:\s]*[\$€£₹]?\s*([\d,]+\.?\d*)/gi,
    /amount[:\s]*[\$€£₹]?\s*([\d,]+\.?\d*)/gi,
    /grand\s*total[:\s]*[\$€£₹]?\s*([\d,]+\.?\d*)/gi,
    /subtotal[:\s]*[\$€£₹]?\s*([\d,]+\.?\d*)/gi,
  ];

  for (const pattern of totalPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numericValue = parseFloat(match[1].replace(/,/g, ""));
      if (!isNaN(numericValue) && numericValue > 0) {
        amounts.push({
          value: numericValue,
          currency: "USD", // Default if not specified
          original: match[0],
          isTotal: true
        });
      }
    }
  }

  return amounts;
}

/**
 * Extract dates from text - Enhanced version
 */
function extractDates(text) {
  const dates = [];
  const months = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  // Enhanced date patterns - more comprehensive
  const enhancedPatterns = [
    // Date with label: "Date: 29/03/2026" or "DATE 29-03-2026"
    /date[:\s]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/gi,
    // Time stamps: "29/03/2026 10:30" 
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\s+\d{1,2}:\d{2}/g,
    // YYYY-MM-DD (ISO format)
    /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/g,
    // DD/MM/YYYY or MM/DD/YYYY
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g,
    // DD/MM/YY or MM/DD/YY
    /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})(?!\d)/g,
    // Month DD, YYYY (March 29, 2026)
    /([A-Za-z]{3,9})[\s\.\-]+(\d{1,2})[,\s]+(\d{4})/gi,
    // DD Month YYYY (29 March 2026)
    /(\d{1,2})[\s\.\-]+([A-Za-z]{3,9})[\s\.\-]+(\d{4})/gi,
    // DD-Mon-YYYY (29-Mar-2026)
    /(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{2,4})/gi,
  ];

  for (const pattern of enhancedPatterns) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);
    while ((match = regex.exec(text)) !== null) {
      try {
        let day, month, year;
        
        // Check if first group is a month name
        const firstLower = match[1]?.toLowerCase();
        const secondLower = match[2]?.toLowerCase();
        
        if (firstLower && months[firstLower]) {
          // Month DD, YYYY format
          month = months[firstLower];
          day = parseInt(match[2]);
          year = parseInt(match[3]);
        } else if (secondLower && months[secondLower]) {
          // DD Month YYYY or DD-Mon-YYYY format
          day = parseInt(match[1]);
          month = months[secondLower];
          year = parseInt(match[3]);
        } else if (parseInt(match[1]) > 31) {
          // YYYY/MM/DD format
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else if (parseInt(match[3]) > 31) {
          // DD/MM/YYYY format - common in India
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
        } else {
          // DD/MM/YY format - assume day first (Indian format)
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
        }

        // Handle 2-digit years
        if (year < 100) {
          year += year > 50 ? 1900 : 2000;
        }

        // Swap day/month if day > 12 and month <= 12 (smart detection)
        if (day > 12 && month <= 12) {
          // day is definitely day, month is definitely month - no swap needed
        } else if (month > 12 && day <= 12) {
          // month and day are swapped, fix it
          [day, month] = [month, day];
        }

        // Validate date
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2030) {
          const date = new Date(year, month - 1, day);
          if (!isNaN(date.getTime()) && date.getDate() === day) {
            dates.push({
              date: date.toISOString().split("T")[0],
              confidence: pattern.source.includes("date") ? "high" : "medium",
              original: match[0]
            });
          }
        }
      } catch (e) {
        // Skip invalid dates
      }
    }
  }

  return dates;
}

/**
 * Detect expense category based on text content
 */
function detectCategory(text) {
  const lowerText = text.toLowerCase();
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        return category;
      }
    }
  }

  return "other";
}

/**
 * Extract merchant/vendor name from text
 */
function extractMerchantName(text) {
  const lines = text.split("\n").filter(line => line.trim().length > 0);
  
  // Usually the merchant name is in the first few lines
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const line = lines[i].trim();
    
    // Skip lines that look like addresses or phone numbers
    if (/^\d+\s/.test(line) || /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/.test(line)) {
      continue;
    }
    
    // Skip very short lines or lines with just numbers
    if (line.length < 3 || /^[\d\s\-\.]+$/.test(line)) {
      continue;
    }

    // Skip lines that are clearly not merchant names
    if (/^(date|time|receipt|invoice|bill|total|subtotal|tax|cash|card|change)/i.test(line)) {
      continue;
    }

    // Return the first suitable line as merchant name
    return line.substring(0, 100); // Limit length
  }

  return null;
}

/**
 * Extract line items from receipt
 */
function extractLineItems(text) {
  const items = [];
  const lines = text.split("\n");
  
  // Pattern for line items: description followed by price
  const itemPattern = /^(.+?)\s+([\$€£₹]?\s*\d+[.,]\d{2})\s*$/;
  
  for (const line of lines) {
    const match = line.trim().match(itemPattern);
    if (match) {
      const description = match[1].trim();
      const priceStr = match[2].replace(/[\$€£₹\s]/g, "").replace(",", ".");
      const price = parseFloat(priceStr);
      
      // Filter out totals, tax lines, etc.
      if (!isNaN(price) && 
          price > 0 && 
          description.length > 2 &&
          !/^(total|subtotal|tax|tip|gratuity|discount|change|cash|card)/i.test(description)) {
        items.push({
          description: description.substring(0, 200),
          amount: price
        });
      }
    }
  }

  return items;
}

/**
 * Main function to parse receipt and extract structured data
 */
export async function parseReceipt(imageBuffer) {
  // Extract raw text
  const { rawText, confidence } = await extractTextFromImage(imageBuffer);
  
  // Extract structured data
  const amounts = extractAmounts(rawText);
  const dates = extractDates(rawText);
  const category = detectCategory(rawText);
  const merchantName = extractMerchantName(rawText);
  const lineItems = extractLineItems(rawText);

  // Find the most likely total amount
  let totalAmount = null;
  let currency = "USD";

  // First priority: amounts marked as total
  const totalAmounts = amounts.filter(a => a.isTotal);
  if (totalAmounts.length > 0) {
    // Get the largest total
    totalAmount = Math.max(...totalAmounts.map(a => a.value));
    currency = totalAmounts[0].currency;
  } else if (amounts.length > 0) {
    // Second priority: the largest amount
    const maxAmount = amounts.reduce((max, a) => a.value > max.value ? a : max, amounts[0]);
    totalAmount = maxAmount.value;
    currency = maxAmount.currency;
  }

  // Find the most recent/likely expense date
  let expenseDate = null;
  if (dates.length > 0) {
    // Priority: dates with "high" confidence (from "Date:" labels)
    const highConfidenceDates = dates.filter(d => d.confidence === "high");
    if (highConfidenceDates.length > 0) {
      expenseDate = highConfidenceDates[0].date;
    } else {
      // Sort by date - prefer dates closest to today (not future dates)
      const today = new Date();
      dates.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        // Exclude future dates
        if (dateA > today && dateB <= today) return 1;
        if (dateB > today && dateA <= today) return -1;
        // Prefer more recent dates
        return dateB - dateA;
      });
      expenseDate = dates[0].date;
    }
  }

  return {
    // Extracted data
    amount: totalAmount,
    currency: currency,
    date: expenseDate,
    category: category,
    merchant_name: merchantName,
    line_items: lineItems,
    
    // Raw data for reference
    raw_text: rawText,
    confidence: confidence,
    all_amounts: amounts,
    all_dates: dates,

    // Suggestions for user
    suggestions: {
      description: merchantName 
        ? `Expense at ${merchantName}` 
        : `${category.charAt(0).toUpperCase() + category.slice(1)} expense`,
    }
  };
}

/**
 * Process receipt from URL
 */
export async function parseReceiptFromUrl(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch image");
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    return await parseReceipt(buffer);
  } catch (error) {
    console.error("Error processing receipt from URL:", error);
    throw error;
  }
}
