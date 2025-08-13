frappe.ui.form.on("Customer", {
    refresh(frm) {
        frm.add_custom_button(__('Customer Insights'), function () {
            const customer = frm.doc.name || '';
            
            // Set route options before navigating - this will be picked up by the page
            frappe.route_options = {
                "customer": [customer] // Pass as array for MultiSelectList
            };
            
            // Navigate to the page without URL parameters
            frappe.set_route("customer-insights");
        }, __("View"));
    },
});