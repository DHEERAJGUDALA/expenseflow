# OCR TROUBLESHOOTING GUIDE

## Common OCR Issues & Solutions

### Issue 1: "No text could be extracted from image"

**Causes:**
- Image is too blurry or low quality
- Image is too dark or overexposed
- Receipt text is too small
- Wrong image format

**Solutions:**
1. Use a clear, well-lit photo of the receipt
2. Ensure receipt is flat (not crumpled)
3. Image should be at least 600px wide
4. Supported formats: JPG, PNG
5. Try increasing contrast before uploading

---

### Issue 2: OCR extracts text but doesn't find amounts/dates

**Causes:**
- Receipt format is unusual
- Currency symbols not recognized
- Date format not matching patterns

**Solutions:**
1. **Check the raw text** in browser console to see what was extracted
2. **Manually enter data** if OCR fails to parse
3. **Common receipt formats we support:**
   - Amounts: $50.00, ₹500, €25.00, £20.00
   - Dates: 29/03/2026, March 29 2026, 29-Mar-2026

---

### Issue 3: Scan button does nothing or shows loading forever

**Causes:**
- Backend not running
- Tesseract.js downloading language files (first run)
- Large image size causing timeout

**Solutions:**
1. Check backend console for errors
2. First scan may take 30-60 seconds (downloading English language pack)
3. Reduce image size if > 5MB
4. Check browser console for network errors

---

## Testing OCR Step-by-Step

### 1. Verify Backend is Running
```bash
cd backend
npm run dev
```

Look for:
```
🚀 Server running on port 3000
```

### 2. Upload a Test Receipt

**Sample Receipt Text (for testing):**
```
ACME Restaurant
123 Main Street

Date: 29/03/2026
Time: 12:30 PM

Burger          $12.99
Fries           $4.50
Coke            $2.50

Subtotal        $19.99
Tax             $1.80
Total           $21.79

Thank you!
```

**How to test:**
1. Create an image with this text (screenshot or photo)
2. Go to `/app/expenses/new`
3. Click "Upload Receipt"
4. Select the image
5. Click "Scan & Auto-Fill"

**Expected Results:**
- Amount: 21.79
- Currency: USD
- Date: 2026-03-29
- Category: meals (detected from "restaurant")
- Merchant: ACME Restaurant

---

### 3. Check Backend Console

When you click "Scan & Auto-Fill", you should see:

```
=== OCR SCAN REQUEST ===
Processing from base64, length: XXXXX
Buffer created, size: XXXX bytes
🔍 Starting OCR extraction...
Image buffer size: XXXX bytes
OCR Progress: recognizing text - 10%
OCR Progress: recognizing text - 25%
OCR Progress: recognizing text - 50%
OCR Progress: recognizing text - 75%
OCR Progress: recognizing text - 100%
✅ OCR extraction complete
Confidence: 85
Text length: 150
First 200 chars: ACME Restaurant...
Analyzing extracted text...
Extraction results:
- Amounts found: 5
- Dates found: 1
- Category: meals
- Merchant: ACME Restaurant
- Line items: 3
✓ Found total amount: 21.79 USD
✓ Found high-confidence date: 2026-03-29
✅ Receipt parsing complete
=== OCR SCAN SUCCESS ===
Amount: 21.79
Currency: USD
Date: 2026-03-29
Category: meals
Merchant: ACME Restaurant
```

---

### 4. Check Frontend Console (Browser DevTools)

**If OCR fails, check:**
1. Open DevTools (F12)
2. Go to Console tab
3. Look for errors like:
   - `Failed to scan receipt: ...`
   - `Network Error`
   - `500 Internal Server Error`

**If you see network errors:**
- Backend is not running on port 3000
- CORS issue (check backend allows frontend origin)

---

## Improving OCR Accuracy

### Best Practices for Receipt Images:

1. **Lighting:**
   - Good lighting, no shadows
   - Avoid glare from flash
   - Natural daylight works best

2. **Image Quality:**
   - At least 600x800 pixels
   - Focus on the receipt text
   - Avoid including background

3. **Receipt Condition:**
   - Flat, not crumpled
   - All text visible
   - Not faded or smudged

4. **Camera Angle:**
   - Straight on (not tilted)
   - Entire receipt in frame
   - No partial cuts

---

## Supported Receipt Formats

### Currency Symbols
- ✅ $ (USD)
- ✅ € (EUR)
- ✅ £ (GBP)
- ✅ ₹ (INR)
- ✅ ¥ (JPY/CNY)
- ✅ Rs. (INR)

### Date Formats
- ✅ DD/MM/YYYY (29/03/2026)
- ✅ MM/DD/YYYY (03/29/2026)
- ✅ YYYY-MM-DD (2026-03-29)
- ✅ Month DD, YYYY (March 29, 2026)
- ✅ DD Month YYYY (29 March 2026)
- ✅ DD-Mon-YYYY (29-Mar-2026)

### Categories Detected
- 🍔 meals: restaurant, cafe, food, pizza, etc.
- ✈️ travel: airline, flight, airport, booking
- 🏨 accommodation: hotel, inn, resort, airbnb
- 🚗 transport: uber, taxi, parking, fuel
- 📄 office_supplies: staples, paper, ink
- 🎬 entertainment: cinema, movie, concert
- 📱 communication: phone, internet, telecom
- 💻 software: subscription, SaaS, license
- 🖥️ equipment: electronics, laptop, hardware

---

## Manual Override

**If OCR fails:**
You can always manually enter the data:
1. Let OCR try (it might get some fields)
2. Correct any wrong values
3. Fill in missing fields
4. Submit expense normally

The raw text from OCR is still saved for audit purposes.

---

## Known Limitations

1. **Handwritten receipts** - OCR works best with printed text
2. **Non-English receipts** - Currently only English is supported
3. **Complex layouts** - Simple receipts work better than multi-column formats
4. **Faded receipts** - Thermal receipts that have faded are hard to read
5. **First scan delay** - Tesseract downloads language files on first use (~30 seconds)

---

## Advanced Debugging

### Test OCR via API Directly

You can test OCR using curl or Postman:

```bash
# Test with a URL
curl -X POST http://localhost:3000/api/ocr/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"image_url": "https://example.com/receipt.jpg"}'

# Test with base64 (truncated for brevity)
curl -X POST http://localhost:3000/api/ocr/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"image_base64": "data:image/jpeg;base64,/9j/4AAQ..."}'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "amount": 21.79,
    "currency": "USD",
    "date": "2026-03-29",
    "category": "meals",
    "merchant_name": "ACME Restaurant",
    "description": "Expense at ACME Restaurant",
    "line_items": [
      {"description": "Burger", "amount": 12.99},
      {"description": "Fries", "amount": 4.50},
      {"description": "Coke", "amount": 2.50}
    ],
    "confidence": 85,
    "raw_text": "ACME Restaurant\\n123 Main Street\\n..."
  }
}
```

---

## Error Messages & Meanings

| Error | Meaning | Solution |
|-------|---------|----------|
| "Either image_base64 or image_url is required" | No image provided | Upload an image first |
| "Please select an image file" | Wrong file type | Use JPG or PNG only |
| "File size must be less than 10MB" | Image too large | Compress image |
| "No text could be extracted from the image" | OCR failed completely | Use clearer image or manual entry |
| "Failed to extract text from image" | Tesseract error | Check backend console for details |
| "Failed to scan receipt" | General error | Check backend console and browser console |

---

## Performance Notes

**Normal OCR Timeline:**
- Upload image: < 1 second
- OCR processing: 5-15 seconds
- Parse data: < 1 second
- **Total: 6-16 seconds**

**First-time OCR (downloads language pack):**
- Total: 30-60 seconds

**If taking longer:**
- Very large image (>5MB)
- Server overloaded
- Network issues

---

## Production Recommendations

For better OCR in production:

1. **Use image preprocessing:**
   - Auto-rotate images
   - Auto-crop to receipt
   - Enhance contrast
   - Denoise

2. **Use cloud OCR services:**
   - Google Cloud Vision API
   - AWS Textract
   - Azure Computer Vision
   - These are more accurate but cost money

3. **Allow manual correction:**
   - Always show extracted data for user review
   - Don't auto-submit without confirmation
   - Save raw OCR text for debugging

4. **Provide feedback:**
   - Show confidence score to user
   - Highlight low-confidence fields
   - Suggest manual entry for < 70% confidence

---

**Last Updated:** 2026-03-29
**Tesseract Version:** 5.1.1
**Supported Language:** English only
