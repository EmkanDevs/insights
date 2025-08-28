frappe.pages['customer-insights'].on_page_load = function(wrapper) {
    let page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'Customer Insights',
        single_column: true
    });

    // keep column headers in one place
    const COLUMN_HEADERS = [
        "Customer",
        "Sales Order",
        "Delivery Note",
        "Sales Invoice",
        "Payment Request",
        "Payment Entry"
    ];

    // will always mirror what's shown in the DataTable (array of arrays)
    let last_table_data = [];

    // ---------- helpers: sanitize, build printable table, csv ----------
    function sanitizeHTMLForPrint(html) {
        const div = document.createElement('div');
        div.innerHTML = html || '';
        div.querySelectorAll('.details-btn, button, input, textarea, select, a').forEach(el => el.remove());
        return div.innerHTML;
    }

    function cellToPlainText(html) {
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
        return `<table class="printable-table">${thead}${tbody}</table>`;
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
        link.download = filename || "Customer_Insights.csv";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    // -------------------------------------------------------------------

    // Print & Export Buttons
    page.add_inner_button(__('Print Table'), function() {
        if (!last_table_data.length) {
            frappe.msgprint("No data to print");
            return;
        }
        const print_window = window.open('', '', 'height=800,width=1000');
        const printableTable = buildPrintableTableHTML();

        print_window.document.write(`
            <html>
            <head>
                <title>Customer Insights</title>
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
        if (!last_table_data.length) {
            frappe.msgprint("No data to export");
            return;
        }
        downloadCSV("Customer_Insights.csv");
    });

    // minor CSS for on-screen table
    $(`<style>
        .dt-cell__content { text-align: left !important; }
    </style>`).appendTo(page.main);

    // Get customer filter from route_options or URL params
    let customerParam = '';
    if (frappe.route_options && frappe.route_options.customer) {
        customerParam = frappe.route_options.customer[0];
        frappe.route_options = null;
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        customerParam = urlParams.get('customer');
    }

    // Filters
    let filters = {
        customer: [],
        customer_group: '',
        date_range: 'Last Week',
        selected_date_range: [frappe.datetime.month_start(), frappe.datetime.now_date()]
    };

    this.page = page;

    // Create filter form on page
    this.form = new frappe.ui.FieldGroup({
        fields: [
            {
                fieldtype: 'MultiSelectList',
                label: 'Customers',
                fieldname: 'customer',
                options: "Customer",
                get_data: function (txt) {
                    return frappe.db.get_link_options("Customer", txt);
                },
                onchange: function() {
                    filters.customer = this.values;
                    fetch_customer_insights();
                }
            },
            { fieldtype: 'Column Break' },
            {
                fieldtype: 'Link',
                label: 'Customer Group',
                fieldname: 'customer_group',
                options: 'Customer Group',
                onchange: function() {
                    filters.customer_group = this.value;
                    fetch_customer_insights();
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
                    fetch_customer_insights();
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
                    fetch_customer_insights();
                }
            }
        ],
        body: this.page.body,
    });
    this.form.make();

    // Set customer field value if coming from URL parameter
    setTimeout(() => {
        const customerField = this.form.get_field('customer');
        if (customerField && customerField.df.fieldtype === 'MultiSelectList') {
            customerField.set_value([customerParam]);
            customerField.refresh();
        }
    }, 500);

    // Create a table container
    let table_container = $("<div class='customer-insights-table mt-3'></div>").appendTo(page.main);

    // Initialize DataTable
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

    function fetch_customer_insights() {
        frappe.call({
            method: 'insights.insights.page.customer_insights.customer_insights.get_customer_insights',
            args: { filters },
            freeze: true,
            freeze_message: 'Fetching customer insights...',
            callback: function(r) {
                if (r.message) {
                    update_table(r.message);
                    frappe.dom.unfreeze();
                }
            }
        });
    }

    function update_table(data) {
        let table_data = data.map(row => [
            `Name: ${row.customer_name || ''}<br>
            Phone: ${row.mobile_no || ''}<br>
            Email ID: ${row.email_id || ''}<br>
            Address: ${row.address || ''}<br>
            Contact: ${row.contact || ''}`,

            row.sales_order ? `Total Records: ${row.sales_order.total_records || 0}<br>
                Total Order Qty: ${row.sales_order.total_qty || 0} Qty<br>
                Total Taxable Amount: ${row.sales_order.total_taxable_amount || '0.00'}ر.س<br>
                Total Amount: ${row.sales_order.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-customer="${row.customer_code}"
                    data-customer_name="${row.customer_name}" 
                    data-doctype="Sales Order" 
                    data-details='${JSON.stringify({ 
                        total_records: row.sales_order.total_records, 
                        total_qty: row.sales_order.total_qty 
                    })}'>Details</button>` : ``,

            row.delivery_note ? `Total Records: ${row.delivery_note.total_records || 0}<br>
                Total Delivered Qty: ${row.delivery_note.total_qty || 0} Qty<br>
                Total Taxable Amount: ${row.delivery_note.total_taxable_amount || '0.00'}ر.س<br>
                Total Amount: ${row.delivery_note.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-customer="${row.customer_code}"
                    data-customer_name="${row.customer_name}" 
                    data-doctype="Delivery Note" 
                    data-details='${JSON.stringify({ 
                        total_records: row.delivery_note.total_records, 
                        total_qty: row.delivery_note.total_qty
                    })}'>Details</button>` : ``,

            row.sales_invoice ? `Total Records: ${row.sales_invoice.total_records || 0}<br>
                Total Qty: ${row.sales_invoice.total_qty || 0} Qty<br>
                Total Taxable Amount: ${row.sales_invoice.total_taxable_amount || '0.00'}ر.س<br>
                Total Amount: ${row.sales_invoice.total_amount || '0.00'}ر.س<br>
                Total Paid Amount: ${row.sales_invoice.paid_amount || '0.00'}ر.س<br>
                Total Pending Amount: ${row.sales_invoice.pending_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-customer="${row.customer_code}"
                    data-customer_name="${row.customer_name}" 
                    data-doctype="Sales Invoice" 
                    data-details='${JSON.stringify({ 
                        total_records: row.sales_invoice.total_records, 
                        total_qty: row.sales_invoice.total_qty
                    })}'>Details</button>` : ``,

            row.payment_request ? `Total Records: ${row.payment_request.total_records || 0}<br>
                Total Amount: ${row.payment_request.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-customer="${row.customer_code}"
                    data-customer_name="${row.customer_name}" 
                    data-doctype="Payment Request" 
                    data-details='${JSON.stringify({ 
                        total_records: row.payment_request.total_records
                    })}'>Details</button>` : ``,

            row.payment_entry ? `Total Records: ${row.payment_entry.total_records || 0}<br>
                Total Amount: ${row.payment_entry.total_amount || '0.00'}ر.س<br><br>
                <button class="btn btn-secondary details-btn" 
                    data-customer="${row.customer_code}"
                    data-customer_name="${row.customer_name}" 
                    data-doctype="Payment Entry" 
                    data-details='${JSON.stringify({ 
                        total_records: row.payment_entry.total_records
                    })}'>Details</button>` : ``
        ]);

        // refresh onscreen table
        data_table.refresh(table_data);

        // keep a clean copy for print/export
        last_table_data = table_data;

        // Add Click Event To Details Button
        $(".customer-insights-table").off("click", ".details-btn").on("click", ".details-btn", function () {
            let customer_code = $(this).data("customer");
            let doctype_name = $(this).data("doctype");
            let details = $(this).data("details");
            let customer_name = $(this).data("customer_name");
            open_customer_details(customer_code, customer_name, doctype_name, details);
        });
    }

    function open_customer_details(customer_code, customer_name, doctype_name, details) {
        frappe.call({
            method: 'insights.insights.page.customer_insights.customer_insights.get_customer_details',
            args: {
                "customer_code": customer_code,
                "customer_name": customer_name,
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

    fetch_customer_insights();
};
