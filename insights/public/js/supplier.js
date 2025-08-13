frappe.ui.form.on("Supplier", {
    refresh(frm) {
        frm.add_custom_button(__('Supplier Insights'), function () {
            const supplier = frm.doc.name || '';
            
            // Set route options before navigating - this will be picked up by the page
            frappe.route_options = {
                "supplier": [supplier] // Pass as array for MultiSelectList
            };
            
            // Navigate to the page without URL parameters
            frappe.set_route("supplier-insights");
        }, __("View"));
    },
});