CREATE TABLE `electricity_tariffs` (
	`id` text PRIMARY KEY NOT NULL,
	`effective_at` text NOT NULL,
	`source` text NOT NULL,
	`notification` text NOT NULL,
	`rates_json` text NOT NULL,
	`tax_sources_json` text NOT NULL,
	`recorded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO electricity_tariffs(id,effective_at,source,notification,rates_json,tax_sources_json) VALUES (
'iesco-unprotected-2026-02-12','2026-02-12','https://iesco.com.pk/tariff-guide','SRO 279(I)/2026',
'[{"max":100,"rate":22.44},{"max":200,"rate":28.91},{"max":300,"rate":33.10},{"max":400,"rate":36.46},{"max":500,"rate":38.95},{"max":600,"rate":40.22},{"max":700,"rate":41.85},{"max":null,"rate":47.20}]',
'{"gst":{"rate":18,"source":"https://download1.fbr.gov.pk/Docs/20267171373418951SalesTaxAct1990updatedupto30.06.2026.pdf"},"income":{"rate":7.5,"threshold":25000,"source":"https://download1.fbr.gov.pk/Docs/2026724177725705IncomeTaxOrdinanace2001.pdf"},"duty":{"rate":null,"status":"Requires applicable bill rate"},"financingSurcharge":{"rate":0.43,"source":"https://iesco.com.pk/bill-calculator"}}'
);
