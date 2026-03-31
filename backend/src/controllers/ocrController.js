import { supabase } from "../config/supabaseClient.js";
import { parseReceipt, parseReceiptFromUrl } from "../services/ocrService.js";
import { v4 as uuidv4 } from "uuid";

/**
 * Scan receipt and extract expense data
 * Accepts either file upload (base64) or URL
 */
export const scanReceipt = async (req, res) => {
  try {
    console.log("=== OCR SCAN REQUEST ===");
    const { image_base64, image_url } = req.body;

    if (!image_base64 && !image_url) {
      return res.status(400).json({ 
        error: "Either image_base64 or image_url is required" 
      });
    }

    let result;

    if (image_url) {
      // Process from URL
      console.log("Processing from URL:", image_url);
      result = await parseReceiptFromUrl(image_url);
    } else {
      // Process from base64
      console.log("Processing from base64, length:", image_base64.length);
      
      // Remove data URL prefix if present
      const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      console.log("Buffer created, size:", buffer.length, "bytes");
      
      result = await parseReceipt(buffer);
    }

    console.log("=== OCR SCAN SUCCESS ===");
    console.log("Amount:", result.amount);
    console.log("Currency:", result.currency);
    console.log("Date:", result.date);
    console.log("Category:", result.category);
    console.log("Merchant:", result.merchant_name);

    res.json({
      success: true,
      data: {
        amount: result.amount,
        currency: result.currency,
        date: result.date,
        category: result.category,
        merchant_name: result.merchant_name,
        description: result.suggestions.description,
        line_items: result.line_items,
        confidence: result.confidence,
        raw_text: result.raw_text
      }
    });
  } catch (err) {
    console.error("=== OCR SCAN ERROR ===");
    console.error("Error:", err);
    console.error("Stack:", err.stack);
    
    res.status(500).json({ 
      error: err.message,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
};

/**
 * Upload receipt image to Supabase Storage and scan it
 */
export const uploadAndScanReceipt = async (req, res) => {
  try {
    const { image_base64, filename } = req.body;
    const userId = req.user.id;

    if (!image_base64) {
      return res.status(400).json({ error: "image_base64 is required" });
    }

    // Remove data URL prefix if present
    const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Determine file extension
    let extension = "jpg";
    if (image_base64.includes("data:image/png")) {
      extension = "png";
    } else if (image_base64.includes("data:image/jpeg") || image_base64.includes("data:image/jpg")) {
      extension = "jpg";
    }

    // Generate unique filename
    const uniqueFilename = filename || `receipt_${userId}_${uuidv4()}.${extension}`;
    const filePath = `receipts/${userId}/${uniqueFilename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("receipts")
      .upload(filePath, buffer, {
        contentType: `image/${extension}`,
        upsert: false
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(`Failed to upload receipt: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("receipts")
      .getPublicUrl(filePath);

    const receiptUrl = urlData.publicUrl;

    // Scan the receipt
    const ocrResult = await parseReceipt(buffer);

    res.json({
      success: true,
      data: {
        receipt_url: receiptUrl,
        amount: ocrResult.amount,
        currency: ocrResult.currency,
        date: ocrResult.date,
        category: ocrResult.category,
        merchant_name: ocrResult.merchant_name,
        description: ocrResult.suggestions.description,
        line_items: ocrResult.line_items,
        confidence: ocrResult.confidence,
        raw_text: ocrResult.raw_text
      }
    });
  } catch (err) {
    console.error("Upload and Scan Error:", err);
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get supported currencies for OCR detection
 */
export const getSupportedCurrencies = async (req, res) => {
  res.json({
    supported_currencies: ["USD", "EUR", "GBP", "INR", "JPY"],
    supported_categories: [
      "meals", "travel", "accommodation", "transport", 
      "office_supplies", "entertainment", "communication", 
      "software", "equipment", "other"
    ]
  });
};
