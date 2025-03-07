import { useState, useEffect, useRef } from "react";

import { Label } from "@repo/ui/components/ui/label";

import { Checkbox } from "@repo/ui/components/ui/checkbox";
import { Switch } from "@repo/ui/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@repo/ui/components/ui/select";

import api from "@repo/anything-api";
import { BaseNodeIcon, BaseSelectIcon } from "../../nodes/node-icon";
import { Button } from "@repo/ui/components/ui/button";
import Link from "next/link";
import { useAnything } from "@/context/AnythingContext";
import ReactSimpleCodeEditorFieldText from "./field-text";
import CodeMirrorFieldJson from "./field-json";
import CodeMirrorFieldText from "./field-text-new";
import CodeMirrorFieldHtml from "./field-html";
import CodemirrorFieldXml from "./field-xml";
import CodeMirrorFieldNumber from "./field-number";
import CodeMirrorFieldBoolean from "./field-boolean";
import CodemirrorFieldJs from "./field-js";
import { createClient } from "@/lib/supabase/client";

export const fieldsMap: { [key: string]: any } = {
  //Deprecated inputs
  simple_text: ReactSimpleCodeEditorFieldText, //old text editor still used in ui some places but not in actually dynamic forms
  //Complex inputs
  javascript_or_variable: CodemirrorFieldJs,
  number_or_variable: CodeMirrorFieldNumber,
  boolean_or_variable: CodeMirrorFieldBoolean,
  object_or_variable: CodeMirrorFieldJson,
  html_or_variable: CodeMirrorFieldHtml,
  xml_or_variable: CodemirrorFieldXml,
  select_or_variable: FieldSelect, //these don't all actually take varaibles
  //but want them all to in the future so want to start the naming convention now
  //Simple inputs
  text: CodeMirrorFieldText,
  account: FieldAccount,
  error: FieldUnknown,
};

// All fields must be understood to basically return text

function FieldRadio({
  name,
  label,
  description,
  value,
  options,
  isVisible,
  error,
  submited,
  onChange,
}: any) {
  const [touched, setTouched] = useState(false);

  if (!isVisible) return null;

  function handleChange(e: any) {
    if (!touched) setTouched(true);
    onChange(name, e.target.value);
  }

  const displayError = submited || touched ? error : null;

  return (
    <fieldset key={name}>
      {/* A11Y errors: https://blog.tenon.io/accessible-validation-of-checkbox-and-radiobutton-groups/ */}
      <Label aria-label={`${label} ${displayError}`}>
        {label}{" "}
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-muted-foreground">
          radio
        </span>
      </Label>
      {description && <div>{description}</div>}
      <div onChange={handleChange}>
        {options.map((opt: any) => (
          <Checkbox key={opt.value}>
            <input
              type="radio"
              name={name}
              value={opt.value}
              defaultChecked={value === opt.value}
            />
            {opt.label}
          </Checkbox>
        ))}
      </div>
      {displayError && <div className="text-red-500">{displayError}</div>}
    </fieldset>
  );
}

function FieldCheckbox({
  name,
  label,
  description,
  value,
  options,
  isVisible,
  error,
  submited,
  onChange,
}: any) {
  const [touched, setTouched] = useState(false);

  if (!isVisible) return null;

  function handleChange(checked: boolean) {
    if (!touched) setTouched(true);
    onChange(name, checked);
  }

  const displayError = submited || touched ? error : null;

  return (
    <div key={name} className="grid gap-2 my-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={name}>
          {label}{" "}
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-muted-foreground">
            checkbox
          </span>
        </Label>
        <div className="flex items-center gap-2 pt-2">
          <Switch
            id={name}
            className="data-[state=checked]:bg-green-400 data-[state=unchecked]:bg-input"
            checked={value}
            onCheckedChange={handleChange}
          />
          {description && (
            <div className="text-sm text-muted-foreground">{description}</div>
          )}
        </div>
      </div>

      {(touched || submited) && error && (
        <div className="text-red-500" id={`${name}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}

function FieldUnknown({ type, name, error }: any) {
  return (
    <p style={{ border: "1px dashed gray", padding: "8px" }}>
      Field "{name}" unsupported: The type "{type}" has no UI component built
      yet.
      {error && (
        <div className="text-red-500" id={`${name}-error`}>
          {error}
        </div>
      )}
    </p>
  );
}

function FieldSelect({
  type,
  name,
  label,
  options,
  description,
  value,
  isVisible,
  error,
  submited,
  onChange,
  onValueChange,
  required,
  ...props
}: any) {
  const [touched, setTouched] = useState(false);

  if (!isVisible) return null;

  function handleValueChange(value: any) {
    if (!touched) setTouched(true);
    // don't pass it to onchange if the value is an empty string
    if (value === "") return;
    onChange(name, value);
    // onChange(value); //THIS maybe caused like a 2 day bug. It should be onChange(name, e.target.value)? on onValueChange
  }

  console.log("[RENDERING SELECT FIELD: ", name, " = ", value, "]");

  return (
    <div className="grid gap-3 my-4">
      <Label htmlFor={name}>
        {label}{" "}
        {/* <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-muted-foreground">
          select
        </span> */}
      </Label>
      <Select value={value} onValueChange={handleValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={description} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option: any) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(touched || submited) && error && (
        <div className="text-red-500" id={`${name}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}

function FieldAccount({
  type,
  name,
  label,
  options,
  description,
  value,
  isVisible,
  error,
  submited,
  onChange,
  onValueChange,
  required,
  provider,
  ...props
}: any) {
  const [touched, setTouched] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [accountsForProvider, setAccountsForProvider] = useState<any[any]>([]);
  const [providerDetails, setProviderDetails] = useState<any[any]>([]);
  const {
    accounts: { selectedAccount },
  } = useAnything();

  console.log("[ACCOUNT FORM FIELD] Rendering with props:", {
    name,
    value,
    provider,
    selectedAccount,
  });

  if (!isVisible) return null;

  function handleValueChange(e: any) {
    console.log("[ACCOUNT FORM FIELD] Value changed:", e);
    if (!touched) setTouched(true);
    onValueChange(e);
  }

  const getProviderDetails = async () => {
    try {
      console.log(
        "[ACCOUNT FORM FIELD] Getting provider details for:",
        provider,
      );
      if (!selectedAccount) return;
      let res = await api.auth.getProvider(
        await createClient(),
        selectedAccount.account_id,
        provider,
      );
      console.log("[ACCOUNT FORM FIELD] Provider details response:", res);
      setProviderDetails(res[0]);
    } catch (e) {
      console.log("[ACCOUNT FORM FIELD] Error getting provider details:", e);
    }
  };

  const getUserAccountsForProvider = async () => {
    try {
      if (!provider || !selectedAccount) return;
      console.log(
        "[ACCOUNT FORM FIELD] Getting accounts for provider:",
        provider,
      );
      let res = await api.auth.getAuthAccountsForProvider(
        await createClient(),
        selectedAccount?.account_id,
        provider,
      );
      console.log("[ACCOUNT FORM FIELD] Provider accounts response:", res);
      setAccountsForProvider(res);
      setHydrated(true);
    } catch (e) {
      console.log("[ACCOUNT FORM FIELD] Error getting user accounts:", e);
    }
  };

  const connect = async (e: any) => {
    e.preventDefault();
    try {
      console.log("[ACCOUNT FORM FIELD] Connecting provider:", provider);
      // let res = await api.auth.connectProvider(provider);
      // console.log("res", res);
    } catch (e) {
      console.log("[ACCOUNT FORM FIELD] Error connecting provider:", e);
    }
  };

  useEffect(() => {
    console.log(
      "[ACCOUNT FORM FIELD] Provider changed in useEffect:",
      provider,
    );
    if (provider) {
      getProviderDetails();
      getUserAccountsForProvider();
    }
  }, []);

  return (
    <div className="grid gap-3 my-4">
      <Label htmlFor={name}>
        {label}{" "}
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[0.6rem] font-medium uppercase text-muted-foreground">
          account
        </span>
      </Label>
      {!hydrated ? (
        <div>Loading...</div>
      ) : (
        <>
          {providerDetails && accountsForProvider.length === 0 ? (
            <div className="flex flex-row items-center border rounded-md p-2">
              <BaseNodeIcon icon={providerDetails.provider_icon} />
              <div className="text-xl ml-2">Connect your Airtable Account</div>
              <div className="ml-auto">
                <Link href="/accounts">
                  <Button variant="outline">Add Account</Button>
                </Link>
                {/* <Button onClick={connect} variant="outline">
                  Connect
                </Button> */}
              </div>
            </div>
          ) : (
            <Select value={value} onValueChange={handleValueChange}>
              <SelectTrigger>
                <SelectValue placeholder={description} />
              </SelectTrigger>
              <SelectContent>
                {accountsForProvider.map((option: any) => (
                  <SelectItem
                    key={option.account_auth_provider_account_slug}
                    value={`{{accounts.${option.account_auth_provider_account_slug}}}`}
                  >
                    <div className="flex flex-row">
                      <div className="mr-2">
                        <BaseSelectIcon icon={providerDetails.provider_icon} />
                      </div>

                      <div className="text-lg flex items-center">
                        {option.account_auth_provider_account_label}
                        {option.failed && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
                            Broken
                          </span>
                        )}
                      </div>
                    </div>
                  </SelectItem>
                ))}
                <div className="border-t my-2 mb-2" />
                <div className="">
                  <div className="flex flex-row">
                    <div className="mr-2 ml-8">
                      <BaseSelectIcon icon={providerDetails.provider_icon} />
                    </div>
                    <div className="text-lg flex items-center">
                      Connnect New Account
                    </div>
                    <div className="ml-auto">
                      <Link href="/settings">
                        <Button variant="outline">Add Account</Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </SelectContent>
            </Select>
          )}
        </>
      )}
      {/* <Label htmlFor={name}>{label}</Label> */}

      {(touched || submited) && error && (
        <div className="text-red-500" id={`${name}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}
