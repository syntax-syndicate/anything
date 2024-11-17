import { useState, useEffect, useRef } from "react";

import {
  formValuesToJsonValues,
  getDefaultValuesFromFields,
} from "@/lib/json-schema-utils";
import { Button } from "@repo/ui/components/ui/button";
import { fieldsMap } from "./form-fields";
import { useAnything } from "@/context/AnythingContext";
import { TriangleAlertIcon } from "lucide-react";

//YES these GLOBALS are super naughty and I never do this but damn
//i could just not get it to work fast enough
//any other way right now
let GLOBAL_CURSOR_LOCATION = 0;
let GLOBAL_ACTIVE_FIELD = "";
let GLOBAL_ACTIVE_FORM_NAME = "";

export function JsonSchemaForm({
  name,
  fields,
  initialValues,
  handleValidation,
  onSubmit,
  onFocus,
  onBlur,
  disabled = false,
}: any): JSX.Element {
  const {
    explorer: { registerCallback, unRegisterCallback },
  } = useAnything();

  const [values, setValues] = useState<{ [key: string]: any }>({});
  const [errors, setErrors] = useState<{ [key: string]: any }>({});
  const [submited, setSubmitted] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const valuesRef = useRef(values);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    console.log("[JSON SCHEMA FORM] Initial values:", initialValues);
    console.log("[JSON SCHEMA FORM] Fields:", fields);
    const defaultValues = getDefaultValuesFromFields(fields, initialValues);
    console.log("[JSON SCHEMA FORM] Default values:", defaultValues);
    setValues(defaultValues);
    setErrors({});
    setHasUnsavedChanges(false);
  }, [fields, initialValues]);

  const handleInternalValidation = (valuesToValidate: any) => {
    const valuesForJson = formValuesToJsonValues(fields, valuesToValidate);

    const { formErrors } = handleValidation(valuesForJson);
    return { errors: formErrors || {}, jsonValues: valuesForJson };
  };

  const handleFieldChange = (fieldName: any, value: any) => {
    if (disabled) return;
    console.log(
      `[JSON SCHEMA FORM] [HANDLE FIELD CHANGE] ${fieldName}:`,
      value,
    );
    setValues((prevValues) => {
      const newValues = {
        ...prevValues,
        [fieldName]: value,
      };
      console.log("[NEW VALUES]", newValues);

      // Add validation on field change
      const { errors, jsonValues } = handleInternalValidation(newValues);
      setErrors(errors);

      return newValues;
    });
    setHasUnsavedChanges(true);
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (disabled) return;
    setSubmitted(true);
    const { errors, jsonValues } = handleInternalValidation(values);
    console.log("[JSON SCHEMA FORM - SUBMIT] Errors:", errors);
    setErrors(errors);
    if (Object.keys(errors).length === 0) {
      console.log(
        "[JSON SCHEMA FORM - SUBMIT] No errors, submitting:",
        jsonValues,
      );
      onSubmit(jsonValues, { formValues: values });
      setHasUnsavedChanges(false);
    }
  };

  //used to hook into showing variables etc
  const handleFieldFocus = (fieldName: string) => {
    if (disabled) return;
    // setFocusedField(fieldName);
    console.log("Show something?");
    if (onFocus) {
      onFocus(fieldName);
    }
  };

  const handleFieldBlur = (e: any) => {
    if (disabled) return;
    // setFocusedField(null);
    console.log("STOP showing something?");
    if (onBlur) {
      onBlur();
    }
  };

  useEffect(() => {
    console.log("[JSON SCHEMA FORM] Values after update:", values);
  }, [values]);

  useEffect(() => {
    console.log("[JSON SCHEMA FORM] Fields after update:", fields);
  }, [fields]);

  console.log("[RENDERING JSON SCHEMA FORM]");
  console.log("Values:", values);

  const handleCursorChange = (e: React.SyntheticEvent, fieldName: string) => {
    if (disabled) return;
    const target = e.target as HTMLTextAreaElement;

    GLOBAL_CURSOR_LOCATION = target.selectionStart;

    GLOBAL_ACTIVE_FIELD = fieldName;

    GLOBAL_ACTIVE_FORM_NAME = name;

    console.log("Event type:", e.type);
    console.log("Cursor position:", {
      start: target.selectionStart,
      end: target.selectionEnd,
    });
    console.log("Active field name:", fieldName);
  };

  const insertVariable = (variable: string) => {
    if (disabled) return;
    if (GLOBAL_ACTIVE_FORM_NAME !== name) {
      console.log("Not the active form");
      return;
    }

    const values = valuesRef.current; // Use the latest values
    console.log("Inserting variable:", variable);
    if (!GLOBAL_ACTIVE_FIELD || GLOBAL_CURSOR_LOCATION === null) {
      console.log("No active field or cursor position");
      return;
    }

    console.log("[INSERT VARIABLE] Cursor location:", GLOBAL_CURSOR_LOCATION);
    console.log("[INSERT VARIABLE] Active field:", GLOBAL_ACTIVE_FIELD);
    console.log("[INSERT VARIABLE] Values:", values);

    const currentValue = values[GLOBAL_ACTIVE_FIELD] || "";
    console.log("[INSERT VARIABLE] Current value:", currentValue);
    const beforeCursor = currentValue.slice(0, GLOBAL_CURSOR_LOCATION);
    console.log("[INSERT VARIABLE] Before cursor:", beforeCursor);
    const afterCursor = currentValue.slice(GLOBAL_CURSOR_LOCATION);
    console.log("[INSERT VARIABLE] After cursor:", afterCursor);
    const newValue = beforeCursor + variable + afterCursor;

    handleFieldChange(GLOBAL_ACTIVE_FIELD, newValue);
  };

  useEffect(() => {
    registerCallback(name, insertVariable);
    return () => {
      unRegisterCallback(name);
    };
  }, []);

  return (
    <form name={name} onSubmit={handleSubmit} noValidate>
      <div>
        {fields?.map((field: any) => {
          const { name: fieldName, inputType } = field;
          console.log("[DEBUG] Field mapping:", {
            fieldName,
            inputType,
            field,
          }); // Add this debug line
          const FieldComponent = fieldsMap[inputType] || fieldsMap.error;

          console.log("Field Value: ", fieldName, " ", values?.[fieldName]);

          return (
            <FieldComponent
              // {...field}ß
              key={fieldName}
              value={values?.[fieldName]}
              error={errors[fieldName]}
              submited={submited}
              type={field.type}
              onChange={handleFieldChange}
              onFocus={() => handleFieldFocus(fieldName)}
              onBlur={handleFieldBlur}
              onSelect={(e: any) => handleCursorChange(e, fieldName)}
              onClick={(e: any) => handleCursorChange(e, fieldName)}
              onKeyUp={(e: any) => handleCursorChange(e, fieldName)}
              onValueChange={(value: any) =>
                handleFieldChange(fieldName, value)
              }
              disabled={disabled}
              //new explicit props
              // type={field.type}
              name={field.name}
              label={field.label}
              options={field.options}
              description={field.description}
              isVisible={field.isVisible}
              // error={field.error}
              // submited={field.submited}
              // onChange={field.onChange}
              // onValueChange={field.onValueChange}
              required={field.required}
            />
          );
        })}
        <div className="flex items-center gap-2">
          <Button type="submit" variant={"default"} disabled={disabled}>
            Submit
          </Button>
          {hasUnsavedChanges && (
            <>
              <TriangleAlertIcon className="w-4 h-4 text-yellow-400" />
              <span className="text-sm ">Unsaved changes</span>
            </>
          )}
        </div>
      </div>
    </form>
  );
}
