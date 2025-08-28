frappe.pages['supplier-insights'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Supplier Insights',
        single_column: true
    });

    // keep column headers in one place
    const COLUMN_HEADERS = [
        "Supplier",
        "Purchase Order",
        "Purchase Receipt",
        "Purchase Invoice",
        "Payment Request",
        "Payment Entry"
    ];

    // will always mirror what's shown in the DataTable (array of arrays)
    let last_table_data = [];

    // ---------- helpers: sanitize, build printable table, csv ----------
    function sanitizeHTMLForPrint(html) {
        // remove buttons/links/inputs etc, keep <br> for visual line breaks
        const div = document.createElement('div');
        div.innerHTML = html || '';
        div.querySelectorAll('.details-btn, button, input, textarea, select, a').forEach(el => el.remove());
        return div.innerHTML;
    }

    function cellToPlainText(html) {
        // convert <br> to \n then strip tags
        const tmp = document.createElement('div');
        tmp.innerHTML = (html || '').replace(/<br\s*\/?>/gi, '\n');
        const text = tmp.textContent || '';
        return text
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean)
            .join('\n');
    }

    function buildPrintableTableHTML() {
        const thead = `<thead><tr>${COLUMN_HEADERS.map(h => `<th>${h}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${
            last_table_data.map(row =>
                `<tr>${row.map(cell => `<td>${sanitizeHTMLForPrint(cell)}</td>`).join('')}</tr>`
            ).join('')
        }</tbody>`;
        return `
            <table class="printable-table">
                ${thead}
                ${tbody}
            </table>
        `;
    }

    function downloadCSV(filename) {
        const lines = [];
        // header
        lines.push(COLUMN_HEADERS.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
        // rows
        last_table_data.forEach(row => {
            const cols = row.map(cell => {
                const text = cellToPlainText(cell);
                return `"${text.replace(/"/g, '""')}"`;
            });
            lines.push(cols.join(','));
        });
        const blob = new Blob(["\ufeff" + lines.join('\n')], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename || "Supplier_Insights.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    // -------------------------------------------------------------------

    // Print & Export Buttons (now use clean table rendered from data)
    page.add_inner_button(__('Print Table'), function() {
        if (!last_table_data.length) { return; }

        const print_window = window.open('', '', 'height=800,width=1000');
        const printableTable = buildPrintableTableHTML();

        print_window.document.write(`
            <html>
            <head>
                <title>Supplier Insights</title>
                <style>
                    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; margin: 16px; }
                    .printable-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                    .printable-table th, .printable-table td {
                        border: 1px solid #000; padding: 6px; text-align: left; vertical-align: top;
                        word-wrap: break-word; white-space: normal;
                    }
                    .printable-table th { background: #f2f2f2; }
                </style>
            </head>
            <body>
                ${printableTable}
            </body>
            </html>
        `);

        print_window.document.close();
        print_window.focus();
        print_window.print();
    });

    page.add_inner_button(__('Export to Excel'), function() {
        if (!last_table_data.length) { return; }
        downloadCSV("Supplier_Insights.csv");
    });

    // minor CSS for on-screen table
    $(`<style>
        .dt-cell__content { text-align: left !important; }
    </style>`).appendTo(page.main);

	// Get supplier filter from route_options or URL params
	let supplierParam = '';
	if (frappe.route_options && frappe.route_options.supplier) {
		supplierParam = frappe.route_options.supplier[0];
		frappe.route_options = null;
	} else {
		const urlParams = new URLSearchParams(window.location.search);
		supplierParam = urlParams.get('supplier');
	}

    // Filters
    let filters = {
        supplier: supplierParam ? [supplierParam] : [],
        supplier_group: '',
        date_range: 'Last Week',
        selected_date_range: [frappe.datetime.month_start(), frappe.datetime.now_date()]
    };

    this.page = page;

    // Filter form
    this.form = new frappe.ui.FieldGroup({
        fields: [
            {
                fieldtype: 'MultiSelectList',
                label: 'Supplier',
                fieldname: 'supplier',
                options: "Supplier",
                get_data: function (txt) {
                    return frappe.db.get_link_options("Supplier", txt);
                },
                onchange: function() {
                    filters.supplier = this.values;
                    fetch_supplier_insights();
                }
            },
            { fieldtype: 'Column Break' },
            {
                fieldtype: 'Link',
                label: 'Supplier Group',
                fieldname: 'supplier_group',
                options: 'Supplier Group',
                onchange: function() {
                    filters.supplier_group = this.value;
                    fetch_supplier_insights();
                }
            },
            { fieldtype: 'Column Break' },
            {
                fieldtype: 'Select',
                label: 'Date Range',
                fieldname: 'date_range',
                default: 'Last Week',
                options: ['Last Week', 'Last Month', 'Last 3 Months', 'Last Year', 'Select Date Range'],
                onchange: function() {
                    filters.date_range = this.value;
                    fetch_supplier_insights();
                }
            },
            { fieldtype: 'Column Break' },
            {
                label: 'Select Date Range',
                fieldtype: 'Date Range',
                fieldname: 'selected_date_range',
                depends_on: "eval:doc.date_range == 'Select Date Range'",
                default: [frappe.datetime.month_start(), frappe.datetime.now_date()],
                onchange: function() {
                    filters.selected_date_range = this.value;
                    fetch_supplier_insights();
                }
            }
        ],
        body: this.page.body,
    });
    this.form.make();

    // Pre-fill supplier from URL
	setTimeout(() => {
		const supplierField = this.form.get_field('supplier');
		if (supplierField && supplierField.df.fieldtype === 'MultiSelectList') {
			supplierField.set_value([supplierParam]);
			supplierField.refresh();
		}
	}, 500);

    // Table container + DataTable
    let table_container = $("<div class='supplier-insights-table mt-3'></div>").appendTo(page.main);

    let data_table = new frappe.DataTable(table_container[0], {
        columns: COLUMN_HEADERS.map((h, i) => ({
            name: h,
            width: i === 0 ? 300 : 250,
            fieldtype: "Data",
            editable: false
        })),
        data: [],
        cellHeight: 200,
        inlineFilters: false,
        noDataMessage: "No records found",
    });

    function fetch_supplier_insights() {
        frappe.call({
            method: 'insights.insights.page.supplier_insights.supplier_insights.get_supplier_insights',
            args: { filters },
            freeze: true,
            freeze_message: 'Fetching supplier insights...',
            callback: function(r) {
                if (r.message) {
                    update_table(r.message);
                    frappe.dom.unfreeze();
                }
            }
        });
    }

    function update_table(data) {
        const table_data = data.map(row => [
            `Name: ${row.supplier_name || ''}<br>
            Phone: ${row.mobile_no || ''}<br>
            Email ID: ${row.email_id || ''}<br>
            Address: ${row.address || ''}<br>
            Contact: ${row.contact || ''}`,

            row.purchase_order ? `Total Records: ${row.purchase_order.total_records || 0}<br>
                Total Order Qty: ${row.purchase_order.total_qty || 0} Qty<br>
                Total Taxable Amount: ${row.purchase_order.total_taxable_amount || '0.00'}ر.س<br>
                Total Amount: ${row.purchase_order.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-supplier="${row.supplier_code}" 
                    data-supplier_name="${row.supplier_name}"
                    data-doctype="Purchase Order" 
                    data-details='${JSON.stringify({ 
                        total_records: row.purchase_order.total_records, 
                        total_qty: row.purchase_order.total_qty 
                    })}'>Details</button>` : ``,

            row.purchase_receipt ? `Total Records: ${row.purchase_receipt.total_records || 0}<br>
                Total Received Qty: ${row.purchase_receipt.total_qty || 0} Qty<br>
                Total Taxable Amount: ${row.purchase_receipt.total_taxable_amount || '0.00'}ر.س<br>
                Total Amount: ${row.purchase_receipt.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-supplier="${row.supplier_code}" 
                    data-supplier_name="${row.supplier_name}"
                    data-doctype="Purchase Receipt" 
                    data-details='${JSON.stringify({ 
                        total_records: row.purchase_receipt.total_records, 
                        total_qty: row.purchase_receipt.total_qty
                    })}'>Details</button>` : ``,

            row.purchase_invoice ? `Total Records: ${row.purchase_invoice.total_records || 0}<br>
                Total Qty: ${row.purchase_invoice.total_qty || 0} Qty<br>
                Total Taxable Amount: ${row.purchase_invoice.total_taxable_amount || '0.00'}ر.س<br>
                Total Amount: ${row.purchase_invoice.total_amount || '0.00'}ر.س<br>
                Total Paid Amount: ${row.purchase_invoice.paid_amount || '0.00'}ر.س<br>
                Total Pending Amount: ${row.purchase_invoice.pending_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-supplier="${row.supplier_code}" 
                    data-supplier_name="${row.supplier_name}"
                    data-doctype="Purchase Invoice" 
                    data-details='${JSON.stringify({ 
                        total_records: row.purchase_invoice.total_records, 
                        total_qty: row.purchase_invoice.total_qty
                    })}'>Details</button>` : ``,

            row.payment_request ? `Total Records: ${row.payment_request.total_records || 0}<br>
                Total Amount: ${row.payment_request.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-supplier="${row.supplier_code}" 
                    data-supplier_name="${row.supplier_name}"
                    data-doctype="Payment Request" 
                    data-details='${JSON.stringify({ 
                        total_records: row.payment_request.total_records
                    })}'>Details</button>` : ``,

            row.payment_entry ? `Total Records: ${row.payment_entry.total_records || 0}<br>
                Total Amount: ${row.payment_entry.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-supplier="${row.supplier_code}" 
                    data-supplier_name="${row.supplier_name}"
                    data-doctype="Payment Entry" 
                    data-details='${JSON.stringify({ 
                        total_records: row.payment_entry.total_records
                    })}'>Details</button>` : ``
        ]);

        // refresh onscreen table
        data_table.refresh(table_data);

        // keep a clean copy for print/export
        last_table_data = table_data;

        // details button click
        $(".supplier-insights-table").off("click", ".details-btn").on("click", ".details-btn", function () {
            let supplier_code = $(this).data("supplier");
            let doctype_name = $(this).data("doctype");
            let details = $(this).data("details");
            let supplier_name = $(this).data("supplier_name");
            open_supplier_details(supplier_code, supplier_name, doctype_name, details);
        });
    }

    function open_supplier_details(supplier_code, supplier_name, doctype_name, details) {
        frappe.call({
            method: 'insights.insights.page.supplier_insights.supplier_insights.get_supplier_details',
            args: {
                "supplier_code": supplier_code,
                "supplier_name": supplier_name,
                "doctype": doctype_name,
                "details": details,
                "filters": filters
            },
            callback: function (r) {
                if (r.message) {
                    let details = r.message;

                    let d = new frappe.ui.Dialog({
                        title: `${doctype_name} Details`,
                        size: "large",
                        fields: [{ fieldtype: "HTML", options: details }],
                        primary_action_label: "Close",
                        primary_action() { d.hide(); }
                    });

                    d.show();
                    d.$wrapper.find('.modal-dialog').css("max-width", "1000px");
                }
            }
        });
    }

    // initial fetch
    fetch_supplier_insights();
};

frappe.pages['supplier-insights'].on_page_show = function(wrapper) {
    if (frappe.route_options && frappe.route_options.supplier) {
        let supplierParam = frappe.route_options.supplier[0];
        frappe.route_options = null;

        const supplierField = wrapper.form && wrapper.form.get_field ? wrapper.form.get_field('supplier') : null;
        if (supplierField && supplierField.df.fieldtype === 'MultiSelectList') {
            supplierField.set_value([supplierParam]);
            supplierField.refresh();
        }

        // try to call the page's fetch if available in scope
        try {
            window.cur_page && window.cur_page.page && window.cur_page.page.body && (window.cur_page.filters = window.cur_page.filters || {});
        } catch (e) { /* no-op */ }
    }
};
