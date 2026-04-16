const { PlaywrightCrawler } = require('crawlee');

const args = process.argv.slice(2);
const targetUrl = args.find(a => a.startsWith('http'));
const maxPages = parseInt(args.find((a, i) => args[i-1] === '--pages') || '1');
const marketplaceArg = args.find((a, i) => args[i-1] === '--marketplace') || 'us';

if (!targetUrl) {
    console.error('Usage: node assets/amazon_handler.js <AMAZON_URL> [--pages N] [--marketplace us|uk|jp|es|au|br]');
    process.exit(1);
}

// Marketplace configuration: domain, display currency, locale cookie
// Note: Prices scraped from amazon.com from a non-US IP (e.g. Singapore) will
// show SGD prices. The _normalize_prices() function in analyzer.py corrects the
// currency symbol for display. True regional pricing requires deploying the
// Docker container on a server in the target region or using a proxy service.
const MARKETPLACE_CONFIG = {
    us: { domain: '.amazon.com',    currency: 'USD', locale: 'en_US', accept_lang: 'en-US,en;q=0.9' },
    uk: { domain: '.amazon.co.uk',  currency: 'GBP', locale: 'en_GB', accept_lang: 'en-GB,en;q=0.9' },
    jp: { domain: '.amazon.co.jp',  currency: 'JPY', locale: 'ja_JP', accept_lang: 'en-US,en;q=0.9' },
    es: { domain: '.amazon.es',     currency: 'EUR', locale: 'es_ES', accept_lang: 'en-US,en;q=0.9' },
    au: { domain: '.amazon.com.au', currency: 'AUD', locale: 'en_AU', accept_lang: 'en-AU,en;q=0.9' },
    br: { domain: '.amazon.com.br', currency: 'BRL', locale: 'pt_BR', accept_lang: 'en-US,en;q=0.9' },
};
const mkt = MARKETPLACE_CONFIG[marketplaceArg] || MARKETPLACE_CONFIG['us'];


function detectPageType(url) {
    if (url.includes('/zgbs/') || url.includes('/bestsellers/')) return 'bestsellers';
    if (url.includes('/zg/new-releases/')) return 'new-releases';
    if (url.includes('/zg/movers-and-shakers/')) return 'movers-shakers';
    if (url.includes('/product-reviews/')) return 'product-reviews';
    if (url.includes('/dp/') || url.includes('/gp/product/')) return 'product-detail';
    if (url.includes('/s?') || url.includes('/s/')) return 'search';
    return 'generic';
}

const pageType = detectPageType(targetUrl);

const crawler = new PlaywrightCrawler({
    launchContext: { launchOptions: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] } },
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 300,
    async requestHandler({ page, log }) {
        log.info(`Amazon Scraper [${pageType}][${marketplaceArg}] => ${targetUrl}`);
        const context = page.context();
        await context.clearCookies();
        await page.setExtraHTTPHeaders({ 'Accept-Language': mkt.accept_lang });

        let allProducts = [];

        for (let pg = 1; pg <= maxPages; pg++) {
            let url = targetUrl;
            if (pg > 1) url = targetUrl.includes('?') ? `${targetUrl}&pg=${pg}` : `${targetUrl}?pg=${pg}`;

            log.info(`Page ${pg}/${maxPages}: ${url}`);
            await page.context().addCookies([
                { name: 'i18n-prefs', value: mkt.currency, domain: mkt.domain, path: '/' },
                { name: 'lc-main',    value: mkt.locale,   domain: mkt.domain, path: '/' },
            ]);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForTimeout(2000);

            await page.waitForTimeout(1000);
            await page.evaluate(async () => {
                for (let i = 0; i < 5; i++) { window.scrollBy(0, window.innerHeight); await new Promise(r => setTimeout(r, 500)); }
                window.scrollTo(0, 0);
            });

            let products = [];

            if (pageType === 'bestsellers' || pageType === 'new-releases' || pageType === 'movers-shakers') {
                products = await page.evaluate(() => {
                    const items = [];
                    const cards = document.querySelectorAll('[data-asin]');

                    if (cards.length > 0) {
                        cards.forEach(card => {
                            try {
                                const rankEl = card.querySelector('.zg-bdg-text, [class*="zg-badge"]');
                                const titleEl = card.querySelector('a span, ._cDEzb_p13n-sc-css-line-clamp-1_1Fn1y, .p13n-sc-truncate');
                                const ratingEl = card.querySelector('[class*="a-icon-alt"]');
                                const reviewEl = card.querySelector('[class*="a-size-small"]');
                                const priceEl = card.querySelector('.p13n-sc-price, ._cDEzb_p13n-sc-price_3mJ9Z, .a-price .a-offscreen');
                                const imgEl = card.querySelector('img');
                                const linkEl = card.querySelector('a[href*="/dp/"]');
                                const asin = card.getAttribute('data-asin') || (linkEl && linkEl.href && linkEl.href.match(/\/dp\/([A-Z0-9]{10})/) ? linkEl.href.match(/\/dp\/([A-Z0-9]{10})/)[1] : null);

                                // bought in past month
                                const allSpans = card.querySelectorAll('span');
                                let boughtPastMonth = null;
                                allSpans.forEach(s => {
                                    const t = s.textContent.trim();
                                    if (t.match(/bought in past month/i)) {
                                        const m = t.match(/([\d,.]+[KkMm]?\+?)\s*bought/i);
                                        boughtPastMonth = m ? m[1] : t;
                                    }
                                });

                                const rank = rankEl ? parseInt(rankEl.textContent.replace('#', '')) : null;
                                const title = titleEl ? titleEl.textContent.trim() : null;
                                const rating = ratingEl ? parseFloat(ratingEl.textContent) : null;
                                const reviews = reviewEl ? parseInt(reviewEl.textContent.replace(/[^0-9]/g, '')) : null;
                                const priceText = priceEl ? priceEl.textContent.trim() : null;
                                const price = priceText ? parseFloat(priceText.replace(/[^0-9.]/g, '')) : null;
                                const image = imgEl ? imgEl.src : null;
                                const url = linkEl ? linkEl.href : null;

                                if (title) {
                                    items.push({ rank, title, rating, reviews, price, priceStr: priceText, asin, image, url, boughtPastMonth });
                                }
                            } catch (e) {}
                        });
                    }

                    if (items.length === 0) {
                        // Fallback: text-based parsing
                        const text = document.body.innerText;
                        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                        let currentRank = null;
                        let currentProduct = {};

                        for (const line of lines) {
                            const rankMatch = line.match(/^#(\d+)$/);
                            if (rankMatch) {
                                if (currentRank && currentProduct.title) items.push(currentProduct);
                                currentRank = parseInt(rankMatch[1]);
                                currentProduct = { rank: currentRank };
                                continue;
                            }
                            if (currentRank) {
                                if (line.match(/^([\d.]+) out of 5 stars$/)) {
                                    currentProduct.rating = parseFloat(line);
                                } else if (line.match(/^\$([\d,.]+)$/)) {
                                    currentProduct.price = parseFloat(line.replace(/[$,]/g, ''));
                                    currentProduct.priceStr = line;
                                } else if (line.match(/^\s*[\d,]+\s*$/) && !currentProduct.reviews && currentProduct.rating) {
                                    currentProduct.reviews = parseInt(line.replace(/,/g, ''));
                                } else if (line.match(/bought in past month/i)) {
                                    const m = line.match(/([\d,.]+[KkMm]?\+?)\s*bought/i);
                                    currentProduct.boughtPastMonth = m ? m[1] : line;
                                } else if (!currentProduct.title && line.length > 10
                                    && !line.includes('out of 5') && !line.includes('Best Seller')
                                    && !line.includes('Previous page') && !line.includes('Next page')) {
                                    currentProduct.title = line;
                                }
                            }
                        }
                        if (currentRank && currentProduct.title) items.push(currentProduct);
                    }
                    return items;
                });

            } else if (pageType === 'product-detail') {
                products = await page.evaluate(() => {
                    const title = (document.querySelector('#productTitle') || {}).textContent?.trim();
                    const priceEl = document.querySelector('.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice');
                    const priceStr = priceEl ? priceEl.textContent.trim() : null;
                    const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.]/g, '')) : null;
                    const ratingEl = document.querySelector('#acrPopover .a-icon-alt');
                    const rating = ratingEl ? parseFloat(ratingEl.textContent) : null;
                    const reviewsEl = document.querySelector('#acrCustomerReviewText');
                    const reviews = reviewsEl ? parseInt(reviewsEl.textContent.replace(/[^0-9]/g, '')) : null;
                    const asin = (document.querySelector('[data-asin]') || {}).getAttribute?.('data-asin') || (window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/) || [])[1];
                    const brand = (document.querySelector('#bylineInfo') || {}).textContent?.trim();
                    const image = (document.querySelector('#landingImage, #imgBlkFront') || {}).src;
                    // BSR strategy 1: table rows in product details section
                    let bsr = null, bsrCategory = null, bsrSubrank = null, bsrSubcategory = null;
                    const bsrRows = Array.from(document.querySelectorAll(
                        '#productDetails_db_sections tr, #productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr'
                    )).filter(r => r.innerText && r.innerText.includes('Best Sellers Rank'));

                    if (bsrRows.length > 0) {
                        const bsrText = bsrRows[0].innerText;
                        const mainMatch = bsrText.match(/#([\d,]+)\s+in\s+([^(\n#]+)/);
                        if (mainMatch) {
                            bsr = parseInt(mainMatch[1].replace(/,/g, ''));
                            bsrCategory = mainMatch[2].trim().replace(/\s+/g, ' ');
                        }
                        const subMatch = bsrText.match(/#([\d,]+)\s+in\s+([^(\n#]+)\s*\(#[\d,]+/);
                        if (!subMatch) {
                            // Try to get second rank entry
                            const allMatches = [...bsrText.matchAll(/#([\d,]+)\s+in\s+([^(\n#]+)/g)];
                            if (allMatches.length > 1) {
                                bsrSubrank = parseInt(allMatches[1][1].replace(/,/g, ''));
                                bsrSubcategory = allMatches[1][2].trim().replace(/\s+/g, ' ');
                            }
                        }
                    }

                    // BSR strategy 2: detail bullets list items
                    if (!bsr) {
                        const bsrBullet = Array.from(document.querySelectorAll(
                            '#detailBullets_feature_div li'
                        )).find(li => li.innerText && li.innerText.includes('Best Sellers Rank'));
                        if (bsrBullet) {
                            const t = bsrBullet.innerText;
                            const m = t.match(/#([\d,]+)\s+in\s+([^(\n#]+)/);
                            if (m) { bsr = parseInt(m[1].replace(/,/g, '')); bsrCategory = m[2].trim(); }
                        }
                    }

                    // BSR strategy 3: generic text regex fallback (expanded)
                    if (!bsr) {
                        const bodyText = document.body.innerText;
                        const m = bodyText.match(/Best Sellers Rank[^#]*#([\d,]+)\s+in\s+([^\n(]+)/);
                        if (m) { bsr = parseInt(m[1].replace(/,/g, '')); bsrCategory = m[2].trim(); }
                    }
                    const breadcrumbs = Array.from(document.querySelectorAll('#wayfinding-breadcrumbs_feature_div a')).map(a => a.textContent.trim());
                    const bullets = Array.from(document.querySelectorAll('#feature-bullets li span')).map(s => s.textContent.trim()).filter(Boolean);

                    // Product details table — parse FIRST so we can reuse for dateFirstAvailable
                    const details = {};
                    document.querySelectorAll(
                        '#productDetails_techSpec_section_1 tr, ' +
                        '#productDetails_detailBullets_sections1 tr, ' +
                        '#detailBullets_feature_div li'
                    ).forEach(row => {
                        const key = (row.querySelector('th, .a-text-bold') || {}).textContent?.trim()?.replace(/[:\s\u200f\u200e]+$/, '');
                        const val = (row.querySelector('td, span:not(.a-text-bold)') || {}).textContent?.trim();
                        if (key && val && key.length < 80) details[key] = val;
                    });

                    // Date first available — Strategy 1: from details table (most reliable)
                    let dateFirstAvailable = details['Date First Available'] || details['Date first available'] || null;
                    // Strategy 2: regex on body text with flexible whitespace
                    if (!dateFirstAvailable) {
                        const dateMatch = document.body.innerText.match(
                            /Date First Available[\s\S]{0,20}?([A-Za-z]+ \d{1,2},?\s+\d{4})/
                        );
                        if (dateMatch) dateFirstAvailable = dateMatch[1].trim();
                    }

                    // Fulfilled by — only inspect the buybox, NOT full body (body always has "amazon")
                    let fulfilledBy = null;
                    const buyboxSelectors = [
                        '#tabular-buybox', '#buybox', '#merchant-info',
                        '#offer-display-feature-text', '#apex_desktop_qualifiedBuyBox',
                        '#desktop_qualifiedBuyBox', '.a-box-group.a-spacing-base',
                    ];
                    for (const sel of buyboxSelectors) {
                        const el = document.querySelector(sel);
                        if (!el) continue;
                        const t = (el.innerText || el.textContent || '').toLowerCase();
                        if (t.includes('fulfilled by amazon') || t.includes('dispatched from and sold by amazon')) {
                            fulfilledBy = 'FBA'; break;
                        }
                        if (t.includes('ships from and sold by amazon') || t.includes('sold by amazon.com')) {
                            fulfilledBy = 'Amazon'; break;
                        }
                        if (/fulfilled by\s+(?!amazon)/i.test(t) || /ships from\s+(?!amazon)/i.test(t)) {
                            fulfilledBy = 'FBM'; break;
                        }
                    }
                    // Badge fallback
                    if (!fulfilledBy && document.querySelector('#SSOFBABadge, [data-feature-name*="FBA"]')) {
                        fulfilledBy = 'FBA';
                    }

                    // Coupon — text regex is most reliable across DOM changes
                    let couponDetail = null;
                    const couponBodyText = document.body.innerText;
                    const couponPatterns = [
                        /Save\s+(\$[\d.]+|\d+%)\s+with\s+(?:a\s+)?coupon/i,
                        /Apply\s+(\$[\d.]+|\d+%)\s+coupon/i,
                        /(\d+%)\s+off\s+coupon/i,
                        /Coupon:\s+(\$[\d.]+\s+off|\d+%\s+off)/i,
                    ];
                    for (const pat of couponPatterns) {
                        const m = couponBodyText.match(pat);
                        if (m) { couponDetail = m[0].trim(); break; }
                    }
                    // DOM fallback for badge elements
                    if (!couponDetail) {
                        const couponEl = document.querySelector(
                            '#couponBadgePrimeLabelId, #couponText, [id*="couponBadge"], ' +
                            '.reinventCouponBadge, [data-csa-c-type*="coupon"]'
                        );
                        if (couponEl) couponDetail = couponEl.textContent.trim() || null;
                    }

                    // Rating distribution (star breakdown) — accessible without login
                    const ratingDistribution = {};
                    document.querySelectorAll('[data-hook="rating-histogram"] tr, .cr-widget-histogram tr').forEach(row => {
                        const starEl = row.querySelector('td:first-child a, .a-size-base');
                        const pctEl = row.querySelector('[data-hook="rating-count"], .a-text-right .a-size-base, td:last-child .a-size-base');
                        if (starEl && pctEl) {
                            const starText = starEl.textContent.trim().replace(/\s*star[s]?\s*/i, '').trim();
                            const pctText = pctEl.textContent.trim();
                            if (starText && /^[1-5]$/.test(starText)) {
                                ratingDistribution[starText + '_star'] = pctText;
                            }
                        }
                    });
                    // Fallback: try percentage text near histogram
                    if (Object.keys(ratingDistribution).length === 0) {
                        const histRows = document.querySelectorAll('[class*="histogram"] tr, [id*="histogramTable"] tr');
                        histRows.forEach((row, i) => {
                            const pct = row.querySelector('[class*="percent"]');
                            if (pct) ratingDistribution[(5 - i) + '_star'] = pct.textContent.trim();
                        });
                    }

                    // Featured reviews from product detail page — accessible without login
                    const featuredReviews = [];
                    document.querySelectorAll('[data-hook="review"]').forEach(card => {
                        try {
                            const ratingEl = card.querySelector('[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt');
                            const titleEl = card.querySelector('[data-hook="review-title"] span:not(.a-icon-alt)');
                            const bodyEl = card.querySelector('[data-hook="review-body"] span');
                            const dateEl = card.querySelector('[data-hook="review-date"]');
                            const verifiedEl = card.querySelector('[data-hook="avp-badge"]');
                            const helpfulEl = card.querySelector('[data-hook="helpful-vote-statement"]');

                            const ratingText = ratingEl ? ratingEl.textContent.trim() : '';
                            const reviewRating = ratingText ? parseFloat(ratingText) : null;
                            const dateText = dateEl ? dateEl.textContent.trim() : '';
                            const dateMatch = dateText.match(/on (.+)$/);
                            const helpfulText = helpfulEl ? helpfulEl.textContent.trim() : '';
                            const helpfulMatch = helpfulText.match(/([\d,]+)/);

                            const body = bodyEl ? bodyEl.textContent.trim() : null;
                            if (body && reviewRating !== null) {
                                featuredReviews.push({
                                    rating: reviewRating,
                                    title: titleEl ? titleEl.textContent.trim() : null,
                                    body,
                                    date: dateMatch ? dateMatch[1].trim() : null,
                                    verified: !!verifiedEl,
                                    helpful: helpfulMatch ? parseInt(helpfulMatch[1].replace(/,/g, '')) : 0,
                                });
                            }
                        } catch (e) {}
                    });

                    return [{ title, price, priceStr, rating, reviews, asin, brand, image,
                        bsr: bsr ? { rank: bsr, category: bsrCategory } : null,
                        bsrSubcategory: bsrSubrank ? { rank: bsrSubrank, category: bsrSubcategory } : null,
                        dateFirstAvailable, category: breadcrumbs, bullets, details,
                        fulfilledBy, coupon: couponDetail,
                        ratingDistribution, featuredReviews }];
                });

            } else if (pageType === 'search') {
                products = await page.evaluate(() => {
                    const items = [];
                    document.querySelectorAll('[data-component-type="s-search-result"]').forEach(card => {
                        try {
                            const asin = card.getAttribute('data-asin');
                            if (!asin) return;

                            // Title: try multiple selectors for robustness
                            const titleEl = card.querySelector('h2 a span')
                                || card.querySelector('[data-cy="title-recipe"] span')
                                || card.querySelector('h2 span')
                                || card.querySelector('.a-size-base-plus.a-color-base.a-text-normal')
                                || card.querySelector('.a-size-medium.a-color-base.a-text-normal');

                            const priceEl = card.querySelector('.a-price .a-offscreen');
                            const ratingEl = card.querySelector('.a-icon-alt');

                            // Reviews: parse from aria-label on rating icon, or find numeric span
                            let reviewEl = null;
                            // Try aria-label approach: "4.5 out of 5 stars  12,345 ratings"
                            const ratingIconEl = card.querySelector('i[class*="a-icon-star"] span.a-icon-alt, .a-icon-star-small span.a-icon-alt');
                            const reviewsAriaEl = card.querySelector('[aria-label$="ratings"], [aria-label$="rating"]');
                            if (reviewsAriaEl) {
                                const ariaLabel = reviewsAriaEl.getAttribute('aria-label') || '';
                                const m = ariaLabel.match(/([\d,]+)\s+rating/i);
                                if (m) reviewEl = { textContent: m[1] };
                            }
                            if (!reviewEl) {
                                reviewEl = card.querySelector('[data-cy="reviews-ratings-slot"] .a-size-base')
                                    || card.querySelector('a[href*="#customerReviews"] .a-size-base')
                                    || card.querySelector('[class*="s-link-style"] .a-size-base')
                                    || (() => {
                                        const spans = Array.from(card.querySelectorAll('.a-size-base'));
                                        return spans.find(s => /^[\d,]+$/.test(s.textContent.trim())) || null;
                                    })();
                            }

                            const imgEl = card.querySelector('.s-image');
                            const linkEl = card.querySelector('h2 a');
                            const sponsoredEl = card.querySelector('.s-label-popover-default, .puis-sponsored-label-text');

                            let boughtPastMonth = null;
                            card.querySelectorAll('span').forEach(s => {
                                const t = s.textContent.trim();
                                if (t.match(/bought in past month/i)) {
                                    const m = t.match(/([\d,.]+[KkMm]?\+?)\s*bought/i);
                                    boughtPastMonth = m ? m[1] : t;
                                }
                            });

                            const title = titleEl ? titleEl.textContent.trim() : null;
                            const reviewsRaw = reviewEl ? reviewEl.textContent.replace(/[^0-9]/g, '') : null;
                            const reviews = reviewsRaw ? parseInt(reviewsRaw) : null;

                            // Coupon badge on search card
                            let coupon = null;
                            const couponEl = card.querySelector(
                                '[data-component-type="s-coupon-component"] span, ' +
                                '.s-coupon-unclipped span, ' +
                                '.aok-align-center .a-color-success, ' +
                                '[class*="coupon"] span'
                            );
                            if (couponEl) coupon = couponEl.textContent.trim() || null;

                            items.push({
                                asin,
                                title,
                                price: priceEl ? parseFloat(priceEl.textContent.replace(/[^0-9.]/g, '')) : null,
                                priceStr: priceEl ? priceEl.textContent.trim() : null,
                                rating: ratingEl ? parseFloat(ratingEl.textContent) : null,
                                reviews,
                                image: imgEl ? imgEl.src : null,
                                url: linkEl ? (linkEl.getAttribute('href') || '').startsWith('http')
                                    ? linkEl.getAttribute('href')
                                    : 'https://www.' + mkt.domain.replace(/^\./, '') + linkEl.getAttribute('href') : null,
                                boughtPastMonth,
                                sponsored: !!sponsoredEl,
                                coupon,
                            });
                        } catch (e) {}
                    });
                    return items;
                });

            } else if (pageType === 'product-reviews') {
                products = await page.evaluate(() => {
                    const asinMatch = window.location.pathname.match(/\/product-reviews\/([A-Z0-9]{10})/);
                    const asin = asinMatch ? asinMatch[1] : null;
                    const items = [];
                    document.querySelectorAll('[data-hook="review"]').forEach(card => {
                        try {
                            const ratingEl = card.querySelector('[data-hook="review-star-rating"] .a-icon-alt, [data-hook="cmps-review-star-rating"] .a-icon-alt');
                            const titleEl = card.querySelector('[data-hook="review-title"] span:not(.a-icon-alt)');
                            const bodyEl = card.querySelector('[data-hook="review-body"] span');
                            const dateEl = card.querySelector('[data-hook="review-date"]');
                            const verifiedEl = card.querySelector('[data-hook="avp-badge"]');
                            const helpfulEl = card.querySelector('[data-hook="helpful-vote-statement"]');

                            const ratingText = ratingEl ? ratingEl.textContent.trim() : '';
                            const rating = ratingText ? parseFloat(ratingText) : null;
                            const helpfulText = helpfulEl ? helpfulEl.textContent.trim() : '';
                            const helpfulMatch = helpfulText.match(/([\d,]+)/);
                            const helpful = helpfulMatch ? parseInt(helpfulMatch[1].replace(/,/g, '')) : 0;

                            // Parse date: "Reviewed in the United States on November 3, 2025"
                            const dateText = dateEl ? dateEl.textContent.trim() : '';
                            const dateMatch = dateText.match(/on (.+)$/);
                            const date = dateMatch ? dateMatch[1].trim() : null;

                            const body = bodyEl ? bodyEl.textContent.trim() : null;
                            const title = titleEl ? titleEl.textContent.trim() : null;
                            if (body && rating !== null) {
                                items.push({ rating, title, body, date, verified: !!verifiedEl, helpful });
                            }
                        } catch (e) {}
                    });
                    return [{ asin, reviews: items }];
                });

            } else {
                // Generic fallback
                const title = await page.title();
                const content = await page.evaluate(() => document.body.innerText);
                console.log(JSON.stringify({ status: 'SUCCESS', type: 'GENERIC', title, data: content.substring(0, 10000) }));
                return;
            }

            // Deduplicate by ASIN
            products = products.filter((p, i, arr) => {
                if (!p.asin) return true;
                const firstIdx = arr.findIndex(x => x.asin === p.asin);
                if (firstIdx !== i) {
                    // Merge rank into first occurrence if missing
                    if (p.rank && !arr[firstIdx].rank) arr[firstIdx].rank = p.rank;
                    if (p.boughtPastMonth && !arr[firstIdx].boughtPastMonth) arr[firstIdx].boughtPastMonth = p.boughtPastMonth;
                    return false;
                }
                return true;
            });

            allProducts.push(...products);
            if (pg < maxPages) await page.waitForTimeout(2000);
        }

        const metadata = await page.evaluate(() => {
            const title = document.title;
            const breadcrumbs = Array.from(document.querySelectorAll('#zg_browseRoot a, .zg-breadcrumb a')).map(a => a.textContent.trim());
            return { title, breadcrumbs };
        });

        console.log(JSON.stringify({
            status: 'SUCCESS',
            type: pageType,
            url: targetUrl,
            category: metadata.title?.replace('Amazon Best Sellers: Best ', '').replace('Amazon.com : ', ''),
            breadcrumbs: metadata.breadcrumbs,
            totalProducts: allProducts.length,
            pages: maxPages,
            scrapedAt: new Date().toISOString(),
            products: allProducts
        }));
    },
});

crawler.run([targetUrl]);
